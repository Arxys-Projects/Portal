import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <img
            src="/email/arxys-logo.png"
            alt="Arxys Partner Portal"
            width={140}
            height={24}
            style={{ height: "auto", display: "inline-block" }}
          />
        </div>
        {children}
      </div>
    </div>
  );
}
