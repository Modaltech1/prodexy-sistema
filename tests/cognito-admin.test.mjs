import assert from "node:assert/strict";
import test from "node:test";
import { mapCognitoUser, matchesCognitoUser, readCognitoAttribute } from "../src/features/cognito-admin/model.ts";
import { parseCreateCognitoUserInput, parseDeleteCognitoUserInput, parsePatchCognitoUserInput } from "../src/features/cognito-admin/input.ts";
import { getCognitoAdminTarget, getCognitoAdminTargets } from "../src/features/cognito-admin/registry.ts";

test("normaliza atributos e estado do usuário Cognito", () => {
  const user = mapCognitoUser({
    Username: "abc-123",
    Attributes: [
      { Name: "email", Value: "cliente@example.com" },
      { Name: "email_verified", Value: "true" },
    ],
    UserStatus: "CONFIRMED",
    Enabled: true,
    UserCreateDate: new Date("2026-11-01T10:00:00.000Z"),
    UserLastModifiedDate: new Date("2026-11-02T11:00:00.000Z"),
  });

  assert.equal(user.username, "abc-123");
  assert.equal(user.email, "cliente@example.com");
  assert.equal(user.emailVerified, true);
  assert.equal(user.status, "CONFIRMED");
  assert.equal(user.enabled, true);
  assert.equal(user.createdAt, "2026-11-01T10:00:00.000Z");
});

test("atributo ausente e busca são tratados sem expor outros campos", () => {
  assert.equal(readCognitoAttribute([{ Name: "sub", Value: "privado" }], "email"), null);
  const user = mapCognitoUser({ Username: "user-1", Attributes: [], UserStatus: "FORCE_CHANGE_PASSWORD", Enabled: false });
  assert.equal(user.email, null);
  assert.equal(user.emailVerified, false);
  assert.equal(user.enabled, false);
  assert.equal(matchesCognitoUser(user, "change_password"), true);
  assert.equal(matchesCognitoUser(user, "cliente@example.com"), false);
});

test("valida e normaliza comandos administrativos", () => {
  assert.deepEqual(
    parseCreateCognitoUserInput({ targetId: "oficina-mais", email: " Cliente@Example.com " }),
    { targetId: "oficina-mais", email: "cliente@example.com" },
  );
  assert.deepEqual(
    parsePatchCognitoUserInput({ action: "set-enabled", targetId: "oficina-mais", username: "user-1", enabled: false }),
    { action: "set-enabled", targetId: "oficina-mais", username: "user-1", enabled: false },
  );
  assert.deepEqual(
    parseDeleteCognitoUserInput({ targetId: "oficina-mais", username: "user-1" }),
    { targetId: "oficina-mais", username: "user-1" },
  );
});

test("bloqueia projeto, ação e senha inválidos antes do SDK", () => {
  assert.throws(() => parseCreateCognitoUserInput({ targetId: "arn:aws:iam::admin", email: "a@example.com" }), /Projeto inválido/);
  assert.throws(() => parsePatchCognitoUserInput({ action: "delete-pool", targetId: "oficina-mais", username: "user-1" }), /Ação administrativa inválida/);
  assert.throws(() => parsePatchCognitoUserInput({ action: "set-password", targetId: "oficina-mais", username: "user-1", password: "curta", permanent: true }), /pelo menos 8/);
  assert.throws(() => parseDeleteCognitoUserInput({ targetId: "oficina-mais", username: "" }), /Informe o usuário/);
});

test("organiza Authentication pelo mesmo projeto e database do explorador", () => {
  const targets = getCognitoAdminTargets();
  assert.deepEqual(targets.map((target) => target.id), ["ph-outlet", "oficina-mais"]);
  assert.equal(targets[0].databaseName, "prodexy_ph_outlet");
  assert.equal(targets[0].poolScope, "shared-dedicated");
  assert.equal(targets[1].databaseName, "prodexy_oficina_mais");
  assert.equal(targets[1].poolScope, "product");
  assert.equal(getCognitoAdminTarget("inexistente"), null);
});
