import type { Metadata } from "next";
import { CvUploader } from "./uploader";

export const metadata: Metadata = { title: "CV" };

export default function CvPage() {
  return (
    <div className="max-w-3xl">
      <p className="text-sm font-medium text-[#5f7067]">Candidate data</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Your CV</h1>
      <p className="mt-3 text-[#68776f]">
        Upload the version used for matching and applications. Files remain private and downloads use short-lived links.
      </p>
      <div className="mt-8">
        <CvUploader />
      </div>
    </div>
  );
}
