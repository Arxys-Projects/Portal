<?php
/**
 * Plugin Name: Arxys Calculator Email Handler with Pipedrive Integration
 * Description: Handles email sending with PDF + Pipedrive CRM integration
 * Version: 2.1
 * Author: Arxys
 *
 * INSTALLATION:
 * 1. Place this file in: wp-content/mu-plugins/arxys-calculator-mailer.php
 * 2. Ensure DOMPDF is at: wp-content/dompdf-3.1.5/
 * 3. Add to wp-config.php: define('ARXYS_PIPEDRIVE_API_TOKEN', 'your_token');
 */

if (!defined('ABSPATH')) exit;

// CORS Headers for cross-domain POSTing
add_action('init', function() {
    if (isset($_POST['action']) && $_POST['action'] === 'arxys_calc_send') {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: POST');
    }
});

add_action('wp_footer', 'arxys_calc_footer_scripts', 99);
function arxys_calc_footer_scripts() {
    ?>
    <script>
    var arxysCalcConfig = {
        ajaxurl: '<?php echo esc_url(admin_url('admin-ajax.php')); ?>'
    };
    </script>
    <?php
}

add_action('wp_ajax_arxys_calc_send', 'arxys_calc_send_email');
add_action('wp_ajax_nopriv_arxys_calc_send', 'arxys_calc_send_email');

function arxys_calc_send_email() {
    error_log('Arxys Calculator: ========== NEW REQUEST ==========');

    // Sanitize all input fields
    $customer_email  = isset($_POST['email']) ? sanitize_email($_POST['email']) : '';
    $customer_name   = isset($_POST['name']) ? sanitize_text_field($_POST['name']) : '';
    $customer_company = isset($_POST['company']) ? sanitize_text_field($_POST['company']) : '';
    $project         = isset($_POST['project']) ? sanitize_text_field($_POST['project']) : '';
    $vms             = isset($_POST['vms']) ? sanitize_text_field($_POST['vms']) : '';
    $retention       = isset($_POST['retention']) ? intval($_POST['retention']) : 30;
    $failover        = isset($_POST['failover']) ? sanitize_text_field($_POST['failover']) : 'No';
    $total_cameras   = isset($_POST['total_cameras']) ? sanitize_text_field($_POST['total_cameras']) : '0';
    $total_bandwidth = isset($_POST['total_bandwidth']) ? sanitize_text_field($_POST['total_bandwidth']) : '0 Mbps';
    $total_storage   = isset($_POST['total_storage']) ? sanitize_text_field($_POST['total_storage']) : '0 GB';
    $daily_storage   = isset($_POST['daily_storage']) ? sanitize_text_field($_POST['daily_storage']) : '0 GB';
    $camera_groups   = isset($_POST['camera_groups']) ? $_POST['camera_groups'] : '[]';

    if (empty($customer_email) || !is_email($customer_email)) {
        wp_send_json_error(['message' => 'Please enter a valid email address.']);
        return;
    }

    $groups = json_decode(stripslashes($camera_groups), true);
    if (!is_array($groups)) $groups = [];

    // Robust Storage Conversion for Server Recommendation
    $storage_str = preg_replace('/[^0-9.]/', '', $total_storage);
    $storage_num = floatval($storage_str);
    if (stripos($total_storage, 'GB') !== false) {
        $storage_tb = $storage_num / 1000;
    } elseif (stripos($total_storage, 'PB') !== false) {
        $storage_tb = $storage_num * 1000;
    } else {
        $storage_tb = $storage_num; // Assumes TB
    }
    $cameras_num = intval($total_cameras);

    // Subject line with company name if provided
    $company_prefix = !empty($customer_company) ? $customer_company . ' - ' : '';
    $subject_internal = 'New Calculator Submission: ' . $company_prefix . $customer_name;
    $subject_customer = 'Your Arxys Video Storage Calculator Results';

    // Generate email bodies
    $body_plain = arxys_build_email_body($customer_name, $customer_email, $customer_company, $project, $vms, $retention, $failover, $total_cameras, $total_bandwidth, $total_storage, $daily_storage, $groups);
    $body_html_customer = arxys_build_html_email($customer_name, $customer_email, $customer_company, $project, $vms, $retention, $failover, $total_cameras, $total_bandwidth, $total_storage, $daily_storage, $groups, 'customer');
    $body_html_andy = arxys_build_html_email($customer_name, $customer_email, $customer_company, $project, $vms, $retention, $failover, $total_cameras, $total_bandwidth, $total_storage, $daily_storage, $groups, 'internal');
    
    // Generate PDF
    $pdf_path = arxys_generate_pdf($customer_name, $customer_email, $customer_company, $project, $vms, $retention, $failover, $total_cameras, $total_bandwidth, $total_storage, $daily_storage, $groups, $cameras_num, $storage_tb);

    $attachments = [];
    if ($pdf_path && file_exists($pdf_path) && is_readable($pdf_path)) {
        $attachments[] = $pdf_path;
        error_log('Arxys Calculator: PDF attached - ' . $pdf_path);
    } else {
        error_log('Arxys Calculator: No PDF - path was: ' . ($pdf_path ?: 'null'));
    }

    $headers = ['Content-Type: text/html; charset=UTF-8'];

    // Send Email #1: To Andy (Internal Notification)
    $sent_arxys = wp_mail('andy.newbom@arxys.com', $subject_internal, $body_html_andy, $headers, $attachments);
    error_log('Arxys Calculator: Andy email: ' . ($sent_arxys ? 'OK' : 'FAILED'));

    // Send Email #2: To Customer
    $sent_customer = wp_mail($customer_email, $subject_customer, $body_html_customer, $headers, $attachments);
    error_log('Arxys Calculator: Customer email: ' . ($sent_customer ? 'OK' : 'FAILED'));

    // Deferred cleanup so SMTP finishes before file is deleted
    if ($pdf_path && file_exists($pdf_path)) {
        add_action('shutdown', function() use ($pdf_path) {
            if (file_exists($pdf_path)) @unlink($pdf_path);
        });
    }

    // =====================================================================
    // PIPEDRIVE CRM INTEGRATION
    // =====================================================================
    
    if (defined('ARXYS_PIPEDRIVE_API_TOKEN') && !empty(ARXYS_PIPEDRIVE_API_TOKEN)) {
        try {
            $pipedrive_result = arxys_pipedrive_integration([
                'name' => $customer_name,
                'email' => $customer_email,
                'company' => $customer_company,
                'project' => $project,
                'vms' => $vms,
                'retention' => $retention,
                'failover' => $failover,
                'total_cameras' => $cameras_num,
                'total_bandwidth' => $total_bandwidth,
                'total_storage' => $total_storage,
                'daily_storage' => $daily_storage,
                'camera_groups' => $groups
            ]);
            
            if (!$pipedrive_result['success']) {
                error_log('Arxys Calculator: Pipedrive integration failed - ' . $pipedrive_result['error']);
            } else {
                error_log('Arxys Calculator: Pipedrive success - Person ID: ' . $pipedrive_result['person_id'] . ', Deal ID: ' . $pipedrive_result['deal_id']);
            }
            
        } catch (Exception $e) {
            error_log('Arxys Calculator: Pipedrive exception - ' . $e->getMessage());
        }
    } else {
        error_log('Arxys Calculator: Pipedrive API token not configured');
    }

    if ($sent_arxys || $sent_customer) {
        wp_send_json_success(['message' => 'Sent! Check your inbox.']);
    } else {
        wp_send_json_error(['message' => 'Failed to send email.']);
    }
}

// Copy all the working helper functions from the uploaded file
// (PDF generation, email builders, server recommendation, etc.)

function arxys_generate_pdf($name, $email, $company, $project, $vms, $retention, $failover, $cameras, $bandwidth, $storage, $daily, $groups, $cameras_num = 0, $storage_tb = 0) {
    $dompdf_path = WP_CONTENT_DIR . '/dompdf-3.1.5/dompdf/autoload.inc.php';
    error_log('Arxys PDF: Checking DOMPDF at: ' . $dompdf_path);
    error_log('Arxys PDF: File exists: ' . (file_exists($dompdf_path) ? 'YES' : 'NO'));

    if (!file_exists($dompdf_path)) {
        error_log('Arxys PDF: DOMPDF not found — no PDF will be generated');
        return false;
    }

    require_once $dompdf_path;

    if (!class_exists('Dompdf\Dompdf')) {
        error_log('Arxys PDF: DOMPDF class not found after loading autoload');
        return false;
    }

    error_log('Arxys PDF: DOMPDF loaded successfully');

    try {
        $options = new \Dompdf\Options();
        $options->set('isRemoteEnabled', true);
        $options->set('isHtml5ParserEnabled', true);
        $dompdf = new \Dompdf\Dompdf($options);

        $html = arxys_build_pdf_html($name, $email, $company, $project, $vms, $retention, $failover, $cameras, $bandwidth, $storage, $daily, $groups, $cameras_num, $storage_tb);
        $dompdf->loadHtml($html);
        $dompdf->setPaper('letter', 'portrait');
        $dompdf->render();

        $canvas = $dompdf->getCanvas();
        $font   = $dompdf->getFontMetrics()->getFont("Helvetica", "normal");
        $canvas->page_script(function ($pageNumber, $pageCount, $canvas, $fontMetrics) use ($font) {
            $canvas->text(500, 750, "Page $pageNumber of $pageCount", $font, 9, [0.4, 0.4, 0.4]);
        });

        $upload_dir = wp_upload_dir();
        $temp_dir   = $upload_dir['basedir'] . '/arxys-temp/';
        if (!file_exists($temp_dir)) wp_mkdir_p($temp_dir);

        $filepath = $temp_dir . 'Arxys-Report-' . date('Y-m-d-His') . '-' . mt_rand(1000, 9999) . '.pdf';
        file_put_contents($filepath, $dompdf->output());

        error_log('Arxys PDF: Generated successfully at ' . $filepath);
        return $filepath;

    } catch (Exception $e) {
        error_log('Arxys PDF: Exception - ' . $e->getMessage());
        return false;
    }
}

function arxys_build_pdf_html($name, $email, $company, $project, $vms, $retention, $failover, $cameras, $bandwidth, $storage, $daily, $groups, $cameras_num = 0, $storage_tb = 0) {
    $date = date('F j, Y');

    $html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
        @page { margin: 50px 50px 80px 50px; }
        body { font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #1e293b; line-height: 1.4; }
        .header { border-bottom: 3px solid #fbb040; padding-bottom: 15px; margin-bottom: 25px; overflow: hidden; }
        .logo { font-size: 24pt; font-weight: bold; color: #fbb040; letter-spacing: 3px; }
        .header-right { float: right; text-align: right; font-size: 9pt; color: #64748b; }
        .title { font-size: 20pt; font-weight: bold; margin: 20px 0; }
        .summary-box { background: #f8fafc; padding: 15px; text-align: center; }
        .data-table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 9pt; }
        .data-table th { background: #fbb040; color: #fff; padding: 10px; text-align: left; font-size: 8pt; text-transform: uppercase; }
        .data-table td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
        .data-table tr.alt td { background: #f8fafc; }
        .section-title { font-size: 12pt; font-weight: bold; border-bottom: 2px solid #e2e8f0; margin: 20px 0 10px 0; padding-bottom: 4px; }
        .note-box { background: #fefce8; border-left: 4px solid #eab308; padding: 12px 15px; margin: 20px 0; font-size: 9pt; color: #713f12; }
    </style></head><body>';

    $html .= '<div class="header">
        <div class="header-right">Generated: ' . esc_html($date) . '<br>www.arxys.com/video-storage-calculator</div>
        <div class="logo">ARXYS</div>
    </div>';

    $html .= '<div class="title">Video Storage &amp; Bandwidth Report</div>';

    $html .= '<table width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:25px;"><tr>
        <td width="32%"><div class="summary-box">
            <div style="font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Total Cameras</div>
            <div style="font-size:18pt;font-weight:bold;color:#2563eb;">' . esc_html($cameras) . '</div>
        </div></td>
        <td width="2%"></td>
        <td width="32%"><div class="summary-box">
            <div style="font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Total Bandwidth</div>
            <div style="font-size:18pt;font-weight:bold;color:#0891b2;">' . esc_html($bandwidth) . '</div>
        </div></td>
        <td width="2%"></td>
        <td width="32%"><div class="summary-box">
            <div style="font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Total Storage</div>
            <div style="font-size:18pt;font-weight:bold;color:#16a34a;">' . esc_html($storage) . '</div>
        </div></td>
    </tr></table>';

    $html .= '<div class="section-title">Project Information</div><table width="100%" style="font-size:10pt;margin-bottom:20px;">';
    if ($name)    $html .= '<tr><td width="130" style="color:#64748b;padding:4px 0;">Prepared For:</td><td style="padding:4px 0;font-weight:bold;">' . esc_html($name) . '</td></tr>';
    if ($company) $html .= '<tr><td style="color:#64748b;padding:4px 0;">Company:</td><td style="padding:4px 0;">' . esc_html($company) . '</td></tr>';
    $html .=               '<tr><td style="color:#64748b;padding:4px 0;">Email:</td><td style="padding:4px 0;">' . esc_html($email) . '</td></tr>';
    if ($project) $html .= '<tr><td style="color:#64748b;padding:4px 0;">Project:</td><td style="padding:4px 0;">' . esc_html($project) . '</td></tr>';
    if ($vms)     $html .= '<tr><td style="color:#64748b;padding:4px 0;">VMS:</td><td style="padding:4px 0;">' . esc_html($vms) . '</td></tr>';
    $html .=               '<tr><td style="color:#64748b;padding:4px 0;">Retention:</td><td style="padding:4px 0;">' . esc_html($retention) . ' days</td></tr>';
    $html .=               '<tr><td style="color:#64748b;padding:4px 0;">Failover:</td><td style="padding:4px 0;">' . esc_html($failover) . '</td></tr>';
    $html .=               '<tr><td style="color:#64748b;padding:4px 0;">Daily Ingest:</td><td style="padding:4px 0;">' . esc_html($daily) . '/day</td></tr>';
    $html .= '</table>';

    $html .= '<div class="section-title">Camera Details</div>
    <table class="data-table"><thead><tr>
        <th>Group</th><th>Qty</th><th>Resolution</th><th>Codec</th><th>FPS</th><th>Scene</th><th>Hrs/Day</th><th>Motion</th><th>Bandwidth</th><th>Storage</th>
    </tr></thead><tbody>';

    $i = 0;
    foreach ($groups as $g) {
        $alt = ($i % 2 === 1) ? ' class="alt"' : '';
        $c   = $g['scene_complexity'] ?? $g['complexity'] ?? 'Medium';
        $h   = $g['hrs_per_day']      ?? $g['hours']      ?? '24';
        $m   = $g['motion_percent']   ?? $g['motion']     ?? '50';
        $html .= '<tr' . $alt . '>
            <td>' . esc_html($g['name']       ?? 'Group') . '</td>
            <td>' . esc_html($g['qty']        ?? '1')     . '</td>
            <td>' . esc_html($g['resolution'] ?? 'N/A')   . '</td>
            <td>' . esc_html($g['codec']      ?? 'N/A')   . '</td>
            <td>' . esc_html($g['fps']        ?? 'N/A')   . '</td>
            <td>' . esc_html($c)                          . '</td>
            <td>' . esc_html($h)                          . '</td>
            <td>' . esc_html($m)                          . '%</td>
            <td>' . esc_html($g['bandwidth']  ?? 'N/A')   . '</td>
            <td>' . esc_html($g['storage']    ?? 'N/A')   . '</td>
        </tr>';
        $i++;
    }
    $html .= '</tbody></table>';

    if ($cameras_num > 0 && $storage_tb > 0) {
        $rec = arxys_get_optimal_server_config($cameras_num, $storage_tb);
        if ($rec['success']) {
            $data   = $rec['data'];
            $server = $data['server'];
            $html .= '<div class="section-title">Recommended Hardware</div>';
            $html .= '<div style="background:#eff6ff;padding:15px;border:2px solid #2563eb;">';
            $html .= '<div style="font-size:14pt;color:#2563eb;font-weight:bold;">' . esc_html($data['units']) . ' x ' . esc_html($server['description']) . '</div>';
            $html .= '<div style="font-size:9pt;margin-top:8px;color:#334155;">System Capacity: ' . number_format($data['total_capacity_cameras']) . ' cameras / ' . number_format($data['total_capacity_storage'], 1) . ' TB</div>';
            $html .= '</div>';
        }
    }

    $html .= '<div class="note-box"><strong>Note:</strong> Storage includes ~20% overhead for VMS best practices (filesystem, database, recording buffers).</div>';

    $html .= '<div style="margin-top:30px;font-size:8pt;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;">
        ARXYS | www.arxys.com | 619.258.7800 | sales@arxys.com
    </div>';

    $html .= '</body></html>';
    return $html;
}

function arxys_build_email_body($name, $email, $company, $project, $vms, $retention, $failover, $cameras, $bandwidth, $storage, $daily, $groups) {
    $body  = "ARXYS VIDEO STORAGE REPORT\n";
    $body .= "===========================\n\n";
    $body .= "Customer:   $name\n";
    if ($company) $body .= "Company:    $company\n";
    $body .= "Email:      $email\n";
    if ($project) $body .= "Project:    $project\n";
    if ($vms)     $body .= "VMS:        $vms\n";
    $body .= "\nTOTALS:\n";
    $body .= "- Cameras:    $cameras\n";
    $body .= "- Bandwidth:  $bandwidth\n";
    $body .= "- Storage:    $storage\n";
    $body .= "- Daily:      $daily/day\n";
    $body .= "- Retention:  $retention days\n";
    $body .= "- Failover:   $failover\n";
    $body .= "\nSee attached PDF for full camera group breakdown and hardware recommendations.\n\n";
    $body .= "ARXYS | www.arxys.com | 619.258.7800\n";
    return $body;
}

function arxys_build_html_email($name, $email, $company, $project, $vms, $retention, $failover, $cameras, $bandwidth, $storage, $daily, $groups, $recipient_type = 'customer') {
    
    $internal_banner = '';
    if ($recipient_type === 'internal') {
        $internal_banner = '<div style="padding:15px;background:#fef3c7;border-left:4px solid #f59e0b;margin-bottom:20px;">
            <p style="margin:0 0 5px;color:#92400e;font-size:14px;font-weight:600;">Internal Notification - New calculator submission</p>
            <p style="margin:0;color:#78350f;font-size:13px;">Report sent to: ' . esc_html($name) . ' (' . esc_html($email) . ')</p>
        </div>';
    }
    
    $groups_html = '';
    foreach ($groups as $group) {
        $groups_html .= '<tr>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;">' . esc_html($group['name'] ?? 'Group') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;text-align:center;">' . esc_html($group['qty'] ?? '1') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;">' . esc_html($group['resolution'] ?? 'N/A') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;">' . esc_html($group['codec'] ?? 'N/A') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;text-align:center;">' . esc_html($group['fps'] ?? 'N/A') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;">' . esc_html($group['scene_complexity'] ?? 'Medium') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;color:#0891b2;font-weight:600;">' . esc_html($group['bandwidth'] ?? 'N/A') . '</td>';
        $groups_html .= '<td style="padding:10px;border:1px solid #ddd;color:#16a34a;font-weight:600;">' . esc_html($group['storage'] ?? 'N/A') . '</td>';
        $groups_html .= '</tr>';
    }
    
    $html = '<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;background:#f8fafc;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.08);overflow:hidden;">
                        
                        ' . $internal_banner . '
                        
                        <tr>
                            <td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:40px;text-align:center;border-bottom:3px solid #fbb040;">
                                <h1 style="margin:0;color:#fbb040;font-size:28px;font-weight:800;">Arxys Video Storage Calculator</h1>
                                <p style="margin:10px 0 0;color:#cbd5e1;font-size:16px;">Your Custom System Report</p>
                            </td>
                        </tr>
                        
                        <tr>
                            <td style="padding:30px 40px;background:#f8fafc;border-bottom:1px solid #e5e7eb;">
                                <h2 style="margin:0 0 20px;color:#0f172a;font-size:18px;font-weight:700;">Project Information</h2>
                                <table width="100%" cellpadding="8" cellspacing="0">
                                    <tr>
                                        <td style="color:#64748b;font-size:14px;font-weight:600;width:140px;">Name:</td>
                                        <td style="color:#0f172a;font-size:14px;">' . esc_html($name) . '</td>
                                    </tr>
                                    ' . (!empty($company) ? '<tr>
                                        <td style="color:#64748b;font-size:14px;font-weight:600;">Company:</td>
                                        <td style="color:#0f172a;font-size:14px;">' . esc_html($company) . '</td>
                                    </tr>' : '') . '
                                    <tr>
                                        <td style="color:#64748b;font-size:14px;font-weight:600;">Email:</td>
                                        <td style="color:#0f172a;font-size:14px;">' . esc_html($email) . '</td>
                                    </tr>
                                    ' . (!empty($project) ? '<tr>
                                        <td style="color:#64748b;font-size:14px;font-weight:600;">Project Name:</td>
                                        <td style="color:#0f172a;font-size:14px;">' . esc_html($project) . '</td>
                                    </tr>' : '') . '
                                    ' . (!empty($vms) ? '<tr>
                                        <td style="color:#64748b;font-size:14px;font-weight:600;">VMS Platform:</td>
                                        <td style="color:#0f172a;font-size:14px;">' . esc_html($vms) . '</td>
                                    </tr>' : '') . '
                                </table>
                            </td>
                        </tr>
                        
                        <tr>
                            <td style="padding:30px 40px;">
                                <h2 style="margin:0 0 20px;color:#0f172a;font-size:18px;font-weight:700;">System Summary</h2>
                                <table width="100%" cellpadding="0" cellspacing="15">
                                    <tr>
                                        <td style="background:#dbeafe;border:2px solid #2563eb;border-radius:10px;padding:20px;text-align:center;width:33%;">
                                            <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Total Cameras</div>
                                            <div style="color:#2563eb;font-size:32px;font-weight:700;">' . esc_html($cameras) . '</div>
                                        </td>
                                        <td style="background:#cffafe;border:2px solid #0891b2;border-radius:10px;padding:20px;text-align:center;width:33%;">
                                            <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Total Bandwidth</div>
                                            <div style="color:#0891b2;font-size:32px;font-weight:700;">' . esc_html($bandwidth) . '</div>
                                        </td>
                                        <td style="background:#dcfce7;border:2px solid #16a34a;border-radius:10px;padding:20px;text-align:center;width:33%;">
                                            <div style="color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:8px;">Total Storage</div>
                                            <div style="color:#16a34a;font-size:32px;font-weight:700;">' . esc_html($storage) . '</div>
                                        </td>
                                    </tr>
                                </table>
                                <table width="100%" cellpadding="12" cellspacing="0" style="margin-top:15px;background:#f8fafc;border-radius:8px;">
                                    <tr>
                                        <td style="color:#64748b;font-size:13px;font-weight:600;">Retention Period:</td>
                                        <td style="color:#0f172a;font-size:13px;text-align:right;font-weight:600;">' . esc_html($retention) . ' days</td>
                                    </tr>
                                    <tr>
                                        <td style="color:#64748b;font-size:13px;font-weight:600;">Daily Storage:</td>
                                        <td style="color:#d97706;font-size:13px;text-align:right;font-weight:600;">' . esc_html($daily) . '/day</td>
                                    </tr>
                                    <tr>
                                        <td style="color:#64748b;font-size:13px;font-weight:600;">Failover Recorder:</td>
                                        <td style="color:#0f172a;font-size:13px;text-align:right;font-weight:600;">' . esc_html($failover) . '</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        
                        <tr>
                            <td style="padding:0 40px 30px;">
                                <h2 style="margin:0 0 20px;color:#0f172a;font-size:18px;font-weight:700;">Camera Groups Breakdown</h2>
                                <div style="overflow-x:auto;">
                                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                                    <thead>
                                        <tr style="background:#f1f5f9;">
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Group</th>
                                            <th style="padding:14px;text-align:center;color:#334155;font-size:11px;text-transform:uppercase;">Qty</th>
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Resolution</th>
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Codec</th>
                                            <th style="padding:14px;text-align:center;color:#334155;font-size:11px;text-transform:uppercase;">FPS</th>
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Scene</th>
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Bandwidth</th>
                                            <th style="padding:14px;text-align:left;color:#334155;font-size:11px;text-transform:uppercase;">Storage</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ' . $groups_html . '
                                    </tbody>
                                </table>
                                </div>
                            </td>
                        </tr>
                        
                        <tr>
                            <td style="padding:30px 40px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
                                <h3 style="margin:0 0 12px;color:#0f172a;font-size:18px;font-weight:700;">Ready to Build Your System?</h3>
                                <p style="margin:0 0 20px;color:#64748b;font-size:14px;">Our team is ready to help you select the perfect VideoX server.</p>
                                <a href="https://www.arxys.com/contact/" style="display:inline-block;background:#fbb040;color:#1e293b;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;">Contact Arxys</a>
                            </td>
                        </tr>
                        
                        <tr>
                            <td style="padding:30px 40px;background:#1e293b;text-align:center;">
                                <p style="margin:0;color:#94a3b8;font-size:13px;">
                                    <strong style="color:#cbd5e1;">Arxys</strong> | San Diego, California<br>
                                    <a href="https://www.arxys.com" style="color:#fbb040;text-decoration:none;">www.arxys.com</a> | 619.258.7800
                                </p>
                            </td>
                        </tr>
                        
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>';
    
    return $html;
}

function arxys_get_optimal_server_config($total_cameras, $total_storage_tb) {
    $servers = get_option('videox_servers', []);
    error_log('Arxys Server Rec: Found ' . count($servers) . ' servers, need ' . $total_cameras . ' cams / ' . $total_storage_tb . ' TB');
    if (empty($servers)) return ['success' => false, 'message' => 'No servers configured'];

    $best_option = null;
    $min_units   = PHP_INT_MAX;

    foreach ($servers as $server) {
        $storage_min = floatval($server['storage_min']);
        $storage_max = floatval($server['storage_max']);
        $max_cameras = intval($server['max_cameras']);

        if ($storage_max <= 0 || $max_cameras <= 0) continue;

        $u_cam = ceil($total_cameras    / $max_cameras);
        $u_sto = ($storage_max > 0) ? ceil($total_storage_tb / $storage_max) : PHP_INT_MAX;
        $units = max(1, $u_cam, $u_sto);

        if ($units < $min_units) {
            $min_units   = $units;
            $best_option = [
                'server'                 => $server,
                'units'                  => $units,
                'total_capacity_cameras' => $units * $max_cameras,
                'total_capacity_storage' => $units * $storage_max,
            ];
        }
    }

    return $best_option
        ? ['success' => true,  'data'    => $best_option]
        : ['success' => false, 'message' => 'No suitable config found'];
}

/**
 * =========================================================================
 * PIPEDRIVE CRM INTEGRATION - UPDATED WITH NEW FIELD IDs
 * =========================================================================
 */

function arxys_pipedrive_integration($data) {
    $api_token = ARXYS_PIPEDRIVE_API_TOKEN;
    
    try {
        $person = arxys_pipedrive_find_person($data['email'], $api_token);
        
        if (!$person) {
            $person = arxys_pipedrive_create_person($data['name'], $data['email'], $api_token);
            if (!$person) {
                throw new Exception('Failed to create Person in Pipedrive');
            }
        }
        
        $deal = arxys_pipedrive_create_deal($person['id'], $data, $api_token);
        
        if (!$deal) {
            throw new Exception('Failed to create Deal in Pipedrive');
        }
        
        return [
            'success' => true,
            'person_id' => $person['id'],
            'deal_id' => $deal['id']
        ];
        
    } catch (Exception $e) {
        return [
            'success' => false,
            'error' => $e->getMessage()
        ];
    }
}

function arxys_pipedrive_find_person($email, $api_token) {
    $url = 'https://api.pipedrive.com/v1/persons/search';
    
    $params = [
        'term' => $email,
        'fields' => 'email',
        'exact_match' => true,
        'api_token' => $api_token
    ];
    
    $response = wp_remote_get(add_query_arg($params, $url), [
        'timeout' => 15,
        'headers' => ['Accept' => 'application/json']
    ]);
    
    if (is_wp_error($response)) {
        error_log('Pipedrive Person Search Error: ' . $response->get_error_message());
        return null;
    }
    
    $body = json_decode(wp_remote_retrieve_body($response), true);
    
    if (isset($body['data']['items'][0]['item'])) {
        return $body['data']['items'][0]['item'];
    }
    
    return null;
}

function arxys_pipedrive_create_person($name, $email, $api_token) {
    $url = 'https://api.pipedrive.com/v1/persons?api_token=' . $api_token;
    
    $data = [
        'name' => $name,
        'email' => [$email]
    ];
    
    $response = wp_remote_post($url, [
        'timeout' => 15,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode($data)
    ]);
    
    if (is_wp_error($response)) {
        error_log('Pipedrive Create Person Error: ' . $response->get_error_message());
        return null;
    }
    
    $body = json_decode(wp_remote_retrieve_body($response), true);
    
    if (isset($body['data']['id'])) {
        return $body['data'];
    }
    
    return null;
}

function arxys_pipedrive_create_deal($person_id, $data, $api_token) {
    $url = 'https://api.pipedrive.com/v1/deals?api_token=' . $api_token;
    
    $timestamp = current_time('Y-m-d H:i:s');
    
    if (!empty($data['company'])) {
        $deal_title = $data['company'] . ' | ' . $data['name'] . ' | Video Storage Quote | ' . $timestamp;
    } else {
        $deal_title = $data['name'] . ' | Video Storage Quote | ' . $timestamp;
    }
    
    // Aggregate data from ALL camera groups
    $resolutions = [];
    $codecs = [];
    $fps_values = [];
    $complexities = [];
    $recording_hours = [];
    $motion_percents = [];
    
    foreach ($data['camera_groups'] as $group) {
        if (!empty($group['resolution'])) $resolutions[] = $group['resolution'];
        if (!empty($group['codec'])) $codecs[] = $group['codec'];
        if (!empty($group['fps'])) $fps_values[] = $group['fps'];
        if (!empty($group['scene_complexity'])) $complexities[] = $group['scene_complexity'];
        if (!empty($group['hrs_per_day'])) $recording_hours[] = $group['hrs_per_day'];
        if (!empty($group['motion_percent'])) $motion_percents[] = $group['motion_percent'];
    }
    
    // NEW TEXT FIELDS can accept combined values
    $resolution_combined = implode(', ', array_unique($resolutions));
    $fps_combined = implode(', ', array_unique($fps_values));
    
    // CODEC - use first value (still dropdown)
    $codec_value = !empty($codecs) ? $codecs[0] : '';
    
    // Complexity - use first value (still dropdown)
    $complexity_value = !empty($complexities) ? $complexities[0] : '';
    
    // Numeric averages
    $avg_recording_hours = !empty($recording_hours) ? round(array_sum($recording_hours) / count($recording_hours)) : 24;
    $avg_motion_percent = !empty($motion_percents) ? round(array_sum($motion_percents) / count($motion_percents)) : 50;
    
    // Build deal data with UPDATED field IDs
    $deal_data = [
        'title' => $deal_title,
        'person_id' => $person_id,
        'value' => 0,
        
        // UPDATED FIELD IDs
        '85887b0ea15d28986ea217a6589b3b27f0c9f220' => $data['total_storage'],           // Total Storage
        'e91462c6f3241fcbb78840b78d01a3fa3ebeb130' => $data['total_cameras'],           // Camera Streams
        '09d5ca2f5bf212a265373cb89143833d821ef722' => $data['retention'],               // Retention Days
        '4e1519d347a5874c14ed601bf6f5ee1b9fccfce3' => $resolution_combined,             // Resolution (NEW TEXT FIELD)
        'b06da1cde9f4249b1d625a6cda998bbdcbc1c550' => $fps_combined,                    // Frame Rate (NEW TEXT FIELD)
        '30bdd73ed2f44f0293629099dfb19899c93fc2af' => $codec_value,                     // CODEC (dropdown - first value)
        '17240086eb6395495e801e90a5e99d126dbf3171' => '',                               // Recommended Server
        'org_id' => $data['company'],                                                    // Organization
        '165d117f0ed8051ae2d6dd36ae48a4b44c501731' => $data['project'],                 // Project Name
        '6ea09394dd7fde702bc437ca18b1a4df06bf6d6a' => $data['vms'],                    // VMS
        '14b1ac17a63898ce550bd20c353a84f0857955c9' => $data['failover'],                // Failover Recorder
        '0404d0b8c9fd70b06d17ede5e51cf34f050d60c0' => $complexity_value,              // Scene Complexity (dropdown - first value)
        '93a866578ccacc7edd3a30434e3bc3360fd56a2f' => $avg_recording_hours,            // Recording Hours (average)
        '6a582a570c24b5f73d0cb6098fedd566f8d3ff3f' => $avg_motion_percent               // Motion Activity % (NEW TEXT FIELD - average)
    ];
    
    $response = wp_remote_post($url, [
        'timeout' => 15,
        'headers' => ['Content-Type' => 'application/json'],
        'body' => json_encode($deal_data)
    ]);
    
    if (is_wp_error($response)) {
        error_log('Pipedrive Create Deal Error: ' . $response->get_error_message());
        return null;
    }
    
    $body = json_decode(wp_remote_retrieve_body($response), true);
    
    if (isset($body['data']['id'])) {
        return $body['data'];
    }
    
    error_log('Pipedrive Create Deal Failed: ' . print_r($body, true));
    return null;
}
