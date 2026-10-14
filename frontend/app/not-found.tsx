import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="mb-2 text-3xl font-black">Nothing here</h1>
      <p className="mb-6 text-muted">That page does not exist, or it is a private playlist.</p>
      <Link href="/" className="rounded-full bg-white px-6 py-3 font-bold text-black hover:scale-105">Back to Home</Link>
    </div>
  );
}
