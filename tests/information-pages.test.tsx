import "./dom-setup";
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { cleanup, render } from "@testing-library/react";
import { LocaleProvider } from "../src/components/locale-provider";
import { LegalPage } from "../src/components/legal-document";
import { InformationLinks } from "../src/components/information-links";
import Experience from "../src/components/experience";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
test("the last footer row has real, ordered public route anchors and the supplied email", () => {
  const ui = render(<Experience />),
    nav = ui.container.querySelector(".site-footer .information-links")!;
  assert.deepEqual(
    Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href")),
    ["/about/", "/terms/", "/privacy/", "mailto:contact.us.ggo@gmail.com"],
  );
  assert.equal(nav.parentElement?.lastElementChild, nav);
  assert.equal(nav.querySelector("button"), null);
});
test("public informational pages have the actual logo, full Vietnamese copy and linked contact/policy destinations", () => {
  for (const kind of ["about", "terms", "privacy"] as const) {
    cleanup();
    const ui = render(
      <LocaleProvider>
        <LegalPage kind={kind} />
      </LocaleProvider>,
    );
    assert.ok(ui.container.querySelector('main>header img[alt="GG-O"]'));
    assert.equal(ui.queryByRole("dialog"), null);
    assert.equal(ui.queryByRole("link", { name: /회원가입으로/ }), null);
    assert.ok(
      ui.container.querySelector(".information-copy")!.textContent!.length >
        600,
    );
    assert.ok(ui.container.querySelector('a[href="https://gg-o.com"]'));
    if (kind === "privacy")
      assert.ok(
        ui.getByRole("link", {
          name: "https://policies.google.com/technologies/ads",
        }),
      );
  }
});
test("Korean and English information documents follow the language selection", () => {
  for (const locale of ["ko", "en"] as const) {
    cleanup();
    localStorage.clear();
    const ui = render(
      <LocaleProvider initialLocale={locale}>
        <LegalPage kind="terms" />
      </LocaleProvider>,
    );
    assert.ok(
      ui.getByRole("heading", {
        level: 1,
        name: locale === "ko" ? "이용약관" : "Terms of use",
      }),
    );
    assert.ok(
      ui.container.textContent?.includes(
        locale === "ko" ? "서면 동의 없는" : "prior written permission",
      ),
    );
  }
});
