import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8f5] px-4 py-12">
      <SignUp />
    </main>
  );
}
