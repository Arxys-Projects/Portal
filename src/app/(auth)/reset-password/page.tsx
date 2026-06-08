import { ResetForm } from "./reset-form";

type Search = Promise<{ new?: string }>;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const { new: isNewParam } = await searchParams;
  const isNew = isNewParam === "1";

  return (
    <>
      <h2 className="mb-2 text-center text-base font-semibold text-neutral-800">
        {isNew ? "Create your password" : "Set a new password"}
      </h2>
      <p className="mb-5 text-center text-sm text-neutral-600">
        {isNew
          ? "This is the password you'll use to sign in to the Arxys Partner Portal from now on. You don't have one yet — choose it below."
          : "Choose a new password for your Arxys Partner Portal account."}
      </p>
      <ResetForm isNew={isNew} />
    </>
  );
}
