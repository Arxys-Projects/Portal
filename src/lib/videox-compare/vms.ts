export const VMS_OPTIONS = [
  {
    id: 'avigilon' as const,
    name: 'Avigilon',
    vmsProduct: 'ACC7',
    sheetUrl: 'https://www.arxys.com/wp-content/uploads/Arxys-VMS-Verified-sheet-Avigilon.pdf',
    sheetLabel: 'Avigilon VMS Validation Sheet',
  },
  {
    id: 'milestone' as const,
    name: 'Milestone',
    vmsProduct: 'Xprotect',
    sheetUrl: 'https://www.arxys.com/wp-content/uploads/Arxys-VMS-Verified-sheet-Milestone.pdf',
    sheetLabel: 'Milestone VMS Validation Sheet',
  },
  {
    id: 'genetec' as const,
    name: 'Genetec',
    vmsProduct: 'Omnicast',
    sheetUrl: 'https://www.arxys.com/wp-content/uploads/Arxys-VMS-Verified-sheet-Genetec.pdf',
    sheetLabel: 'Genetec VMS Validation Sheet',
  },
] as const;

export type VmsId = (typeof VMS_OPTIONS)[number]['id'];
