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
  let button = await visible();
  if (!button) {
    const more = page.getByRole('button', { name: 'Mais', exact: true });
    if (await more.count() && await more.first().isVisible()) {
      await more.first().click();
      button = await visible();
    }
  }
  expect(button, `destino navegável visível: ${name}`).toBeDefined();
  await button!.click();
  await expect(page.locator('[data-mobile=true]')).toHaveCount(0);
}
