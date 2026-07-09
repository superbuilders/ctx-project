import { signIn } from "@/lib/auth";
import { Terminal } from "lucide-react";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ctx-bg">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Terminal className="w-12 h-12 text-ctx-accent mx-auto mb-4" />
          <h1 className="text-2xl font-bold">ctx</h1>
          <p className="text-ctx-text-muted text-sm mt-2">
            Unix-native context layer for AI-augmented teams
          </p>
        </div>

        <div className="bg-ctx-surface border border-ctx-border rounded-lg p-6">
          <form
            action={async () => {
              "use server";
              await signIn("cognito", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full bg-ctx-accent hover:bg-ctx-accent-hover text-white font-medium py-2.5 px-4 rounded-lg transition-colors"
            >
              Sign in with SSO
            </button>
          </form>

          <p className="text-xs text-ctx-text-muted text-center mt-4">
            Authenticates via your company&apos;s identity provider
          </p>
        </div>

        <p className="text-xs text-ctx-text-muted text-center mt-6">
          Once signed in, you can also access ctx via SSH
        </p>
      </div>
    </div>
  );
}
