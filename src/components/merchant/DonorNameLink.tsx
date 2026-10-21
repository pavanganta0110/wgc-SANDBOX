import Link from "next/link";

// Donor name that opens the donor page when the record has a linked Donor; plain text otherwise
// (e.g. invoice payers never become Donor records).
export default function DonorNameLink({ donorId, name, className = "" }: { donorId?: string | null; name: string; className?: string }) {
  if (!donorId) return <>{name}</>;
  return (
    <Link href={`/merchant/donors/${donorId}`} className={`text-blue-600 hover:underline ${className}`.trim()}>
      {name}
    </Link>
  );
}
