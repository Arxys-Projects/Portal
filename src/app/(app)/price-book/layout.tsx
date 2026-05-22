import type { ReactNode } from "react";

export default function PriceBookLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {/* Poppins + Montserrat for price book pages only */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Montserrat:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <div className="price-book-route">{children}</div>
    </>
  );
}
