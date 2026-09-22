import { expect, type Page } from '@playwright/test';

export async function navigate(page: Page, name: string) {
  const label = name;
  const candidates = [
    page.locator('[data-slot=sidebar-menu-button]').filter({ hasText: label }),
    page.locator('.mobile-nav button').filter({ hasText: label }),
  ];
  const visible = async () => {
    for (const locator of candidates) {
      for (let i = 0; i < await locator.count(); i += 1) {
        const item = locator.nth(i);
        if (await item.isVisible()) return item;
      }
    }
    return undefined;
  };
  const more = page.getByRole('button', { name: 'Mais', exact: true });
  // goto waits for the document, not necessarily for React's first commit.
  await expect.poll(async () => Boolean(await visible()) || await more.first().isVisible(), { message: 'Navegação pronta após montagem do React' }).toBe(true);
  let button = await visible();
  if (!button) {
    if (await more.count() && await more.first().isVisible()) {
      await more.first().click();
      await expect.poll(async () => Boolean(await visible()), { message: `Destino visível no menu: ${name}` }).toBe(true);
      button = await visible();
    }
  }
  expect(button, `destino navegável visível: ${name}`).toBeDefined();
  await button!.click();
  await expect(page.locator('[data-mobile=true]')).toHaveCount(0);
}
