export default function WalkthroughPage() {
  return (
    <div className="w-screen h-screen overflow-hidden bg-[#faf8f3]">
      <iframe
        src="/walkthrough/index.html"
        className="w-full h-full border-none"
        title="WGC Giving Page Walkthrough"
      />
    </div>
  );
}
