"use strict";

const IDENT = "[A-Za-z_$][\\w$]*";
const PATCH_MARKER = "session-route-external-bound";

const canServeSessionGuardPattern = new RegExp(
  `canServeSession\\((?<request>${IDENT}),(?<backendState>${IDENT})\\)\\{` +
    `let\\{sessionId:(?<backendSession>${IDENT})\\}=\\k<backendState>;` +
    `if\\(this\\.backendStatesBySessionId\\.get\\(\\k<backendSession>\\)!==\\k<backendState>\\)return!1;` +
    `if\\(\\k<request>\\.conversationId===\\k<backendSession>\\)return this\\.ensureSessionRoute\\(\\k<request>\\);` +
    `(?<guard>if\\(this\\.pendingLocalWorkSessionIds\\.size!==1\\|\\|!this\\.pendingLocalWorkSessionIds\\.has\\(\\k<backendSession>\\)\\|\\|this\\.sessionRoutes\\.has\\(\\k<request>\\.conversationId\\)\\)return!1;)`,
  "gu",
);

function externalSessionGuard({ request, backendSession }) {
  return (
    `if(this.sessionRoutes.has(${request}.conversationId))return this.ensureSessionRoute(${request});` +
    `if(this.pendingLocalWorkSessionIds.size!==1||!this.pendingLocalWorkSessionIds.has(${backendSession})){` +
    `if(process.platform===\`linux\`){` +
    `let __codexExternalBackendRoute=this.sessionRoutes.get(${backendSession});` +
    `if(__codexExternalBackendRoute!=null&&this.delegate?.isWindowAlive(__codexExternalBackendRoute.windowId)===!0){` +
    `let __codexExternalLiveRouteKeys=new Set;` +
    `for(let __codexExternalCandidate of this.sessionRoutes.values())this.delegate?.isWindowAlive(__codexExternalCandidate.windowId)===!0&&__codexExternalLiveRouteKeys.add(\`${"${__codexExternalCandidate.windowId}:${__codexExternalCandidate.browserConversationId}"}\`);` +
    `if(__codexExternalLiveRouteKeys.size===1){` +
    `this.sessionRoutes.set(${request}.conversationId,{browserConversationId:__codexExternalBackendRoute.browserConversationId,disposeAfterSessionActivity:!1,ownerWebContentsId:__codexExternalBackendRoute.ownerWebContentsId,sessionId:${request}.conversationId,windowId:__codexExternalBackendRoute.windowId});` +
    `this.recordDebugEvent({browserTabId:null,conversationId:${request}.conversationId,details:[{label:\`backendSessionId\`,value:String(${backendSession})},{label:\`browserConversationId\`,value:String(__codexExternalBackendRoute.browserConversationId)}],guestWebContentsId:null,kind:\`${PATCH_MARKER}\`,message:\`Bound external terminal Browser Use session route\`,ownerWebContentsId:__codexExternalBackendRoute.ownerWebContentsId,pageKey:null,windowId:__codexExternalBackendRoute.windowId});` +
    `return this.ensureSessionRoute(${request})` +
    `}}}return!1}`
  );
}

function applyLinuxIabTerminalRoutePatch(source) {
  if (source.includes(PATCH_MARKER)) return source;

  const matches = [...source.matchAll(canServeSessionGuardPattern)];
  if (matches.length !== 1 || matches[0].groups == null) {
    if (
      source.includes("canServeSession(") &&
      source.includes("pendingLocalWorkSessionIds") &&
      source.includes("ensureSessionRoute(")
    ) {
      console.warn(
        `WARN: Expected one current IAB session-serving gate, found ${matches.length} - skipping Linux terminal IAB route patch`,
      );
    }
    return source;
  }

  const match = matches[0];
  const { guard, request, backendSession } = match.groups;
  const replacement = match[0].replace(
    guard,
    externalSessionGuard({ request, backendSession }),
  );
  return source.slice(0, match.index) + replacement + source.slice(match.index + match[0].length);
}

module.exports = {
  PATCH_MARKER,
  applyLinuxIabTerminalRoutePatch,
};
