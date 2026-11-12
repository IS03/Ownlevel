import { protocolHash, validateProtocol, type Protocol } from "./reserved-protocol";

/**
 * Offline research prototype (#367). The ONLY way to obtain a permit for a reserved namespace is `authorize`.
 * Permits are tracked in a module-private WeakMap, so a hand-built object is never accepted by `isValidPermit`.
 */

export const AUTHORIZATION_STATEMENT = "Authorize ONE run of this protocol at this commit";

export interface Authorization {
  protocolVersion: string; protocolHash: string; sourceHash: string; commit: string; namespace: string;
  authorizedBy: string; authorizedAt: string; statement: string;
}
export interface Environment { commit: string; sourceHash: string; treeClean: boolean }
export interface ReservedPermit { readonly kind: "reserved-permit"; readonly namespace: string }

const minted = new WeakMap<object, string>();
const FIELDS = ["protocolVersion", "protocolHash", "sourceHash", "commit", "namespace", "authorizedBy", "authorizedAt", "statement"] as const;
const FULL_SHA = /^[0-9a-f]{40}$/;

function refuse(message: string): never { throw new Error(`Authorization refused: ${message}`); }

/** Throws unless the authorization matches this exact protocol, source and commit. Called before any seed is derived. */
export function authorize(protocol: Protocol, authorization: unknown, environment: Environment): ReservedPermit {
  validateProtocol(protocol);
  if (!environment || typeof environment.commit !== "string" || typeof environment.sourceHash !== "string" || typeof environment.treeClean !== "boolean") refuse("environment is incomplete");
  if (!FULL_SHA.test(environment.commit)) refuse("environment commit is not a full 40-hex SHA");
  if (!authorization || typeof authorization !== "object") refuse("no authorization manifest");
  const auth = authorization as Record<string, unknown>;
  for (const field of FIELDS) if (typeof auth[field] !== "string" || auth[field] === "") refuse(`field ${field} missing or not a string`);
  const a = auth as unknown as Authorization;
  if (a.statement !== AUTHORIZATION_STATEMENT) refuse("statement does not match");
  if (a.protocolVersion !== protocol.version) refuse("protocolVersion does not match");
  if (a.protocolHash !== protocolHash(protocol)) refuse("protocolHash does not match the protocol");
  if (a.sourceHash !== environment.sourceHash) refuse("sourceHash does not match the live source files");
  if (!FULL_SHA.test(a.commit)) refuse("commit is not a full 40-hex SHA");
  if (a.commit !== environment.commit) refuse("commit does not match HEAD");
  if (a.namespace !== protocol.namespace) refuse("namespace does not match the protocol");
  if (protocol.kind === "reserved" && environment.treeClean !== true) refuse("the working tree has changes in the source files");
  const permit: ReservedPermit = Object.freeze({ kind: "reserved-permit" as const, namespace: protocol.namespace });
  minted.set(permit, protocol.namespace);
  return permit;
}

export function isValidPermit(permit: unknown, namespace: string): boolean {
  return typeof permit === "object" && permit !== null && minted.get(permit) === namespace;
}

/** The manifest a person would sign. Building one grants nothing: `authorize` still checks every field. */
export function buildAuthorization(protocol: Protocol, environment: Environment, authorizedBy: string, authorizedAt: string): Authorization {
  return {
    protocolVersion: protocol.version, protocolHash: protocolHash(protocol), sourceHash: environment.sourceHash, commit: environment.commit,
    namespace: protocol.namespace, authorizedBy, authorizedAt, statement: AUTHORIZATION_STATEMENT,
  };
}
