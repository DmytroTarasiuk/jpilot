import { defaultEveAuth, eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";
import { clerkAppAuth } from "../../lib/auth/clerk-agent";
import { bindAgentSession } from "../../lib/db/tenancy";

export default eveChannel({
  auth: [
    // Browser users authenticate through Clerk. The verifier also enforces session ownership.
    clerkAppAuth(),
    // Trusted deployment-to-deployment calls use Vercel OIDC.
    vercelOidc(),
    // This fallback is active only in an actual local development runtime.
    localDev(),
  ],
  onMessage(ctx) {
    return { auth: defaultEveAuth(ctx), clientContext: [] };
  },
  events: {
    async "turn.started"(_event, _channel, ctx) {
      const caller = ctx.session.auth.current;
      const tenantId = caller?.attributes.tenantId;
      const userId = caller?.attributes.appUserId;
      if (
        caller?.principalType === "user" &&
        typeof tenantId === "string" &&
        typeof userId === "string"
      ) {
        await bindAgentSession({ sessionId: ctx.session.id, tenantId, userId });
      }
    },
  },
});
