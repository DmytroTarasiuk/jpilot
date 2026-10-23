import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f8f5] px-4 py-12">
      <SignIn />
    </main>
  );
}
