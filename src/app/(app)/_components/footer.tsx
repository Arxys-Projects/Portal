export default function Footer() {
  return (
    <div className="mt-12 pt-6 border-t border-line text-xs text-ink-soft leading-relaxed">
      <p>
        Prices and specs subject to change without notice. Arxys reserves the
        right to substitute components, ensuring equivalent or superior
        performance. All tariff taxes are passed on to buyers. All Arxys VideoX
        products are NDAA compliant with no disclosures. Windows Server IoT for
        Storage Workgroup EULA and Microsoft conditions apply.
      </p>
      <p className="mt-2">
        © Arxys 2026 · VideoX© · DataX© · AnalyticX©{" "}
        <a
          href="https://www.arxys.com"
          className="text-arxys-navy hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          www.arxys.com
        </a>{" "}
        ·{" "}
        <a
          href="https://www.arxys.com/about/"
          className="text-arxys-navy hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          About Arxys
        </a>{" "}
        ·{" "}
        <a
          href="https://www.arxys.com/support/"
          className="text-arxys-navy hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Support &amp; Resources
        </a>{" "}
        ·{" "}
        <a
          href="https://www.arxys.com/contact/"
          className="text-arxys-navy hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Contact Sales for Custom Configurations
        </a>
      </p>
    </div>
  );
}
