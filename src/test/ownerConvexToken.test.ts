import { describe, expect, it } from "vitest";
import {
  deriveConvexCloudUrl,
  splitOwnerTokenIdentifier,
} from "../../convex/ownerConvexToken";

describe("splitOwnerTokenIdentifier", () => {
  it("splits a Convex tokenIdentifier back into its claims", () => {
    expect(
      splitOwnerTokenIdentifier(
        "https://combative-zebra-261.eu-west-1.convex.site|k171qspc12y3frt6qb6mtnq3jn84r59q"
      )
    ).toEqual({
      issuer: "https://combative-zebra-261.eu-west-1.convex.site",
      subject: "k171qspc12y3frt6qb6mtnq3jn84r59q",
    });
  });

  it("keeps pipes inside the subject with the issuer", () => {
    expect(splitOwnerTokenIdentifier("https://issuer.example|user|with|pipes")).toEqual({
      issuer: "https://issuer.example",
      subject: "user|with|pipes",
    });
  });

  it("rejects values that are not `${issuer}|${subject}`", () => {
    expect(splitOwnerTokenIdentifier("")).toBeNull();
    expect(splitOwnerTokenIdentifier("no-separator")).toBeNull();
    expect(splitOwnerTokenIdentifier("|only-subject")).toBeNull();
    expect(splitOwnerTokenIdentifier("only-issuer|")).toBeNull();
    expect(splitOwnerTokenIdentifier("|")).toBeNull();
  });
});

describe("deriveConvexCloudUrl", () => {
  it("points a Convex site url at its websocket deployment", () => {
    expect(deriveConvexCloudUrl("https://x.eu-west-1.convex.site")).toBe(
      "https://x.eu-west-1.convex.cloud"
    );
  });

  it("leaves a non-Convex host untouched", () => {
    expect(deriveConvexCloudUrl("https://pravah.example")).toBe(
      "https://pravah.example"
    );
  });
});
