export function dbError(err: unknown, context: string): string {
  console.error(`[${context}]`, err);
  return "Something went wrong — please try again.";
}
