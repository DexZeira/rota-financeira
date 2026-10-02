import { expect, type Page } from '@playwright/test';

export async function selectSettingsSection(page: Page, name: string) {
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  const picker = page.getByRole('button', {
    name: 'Seções de configurações',
    exact: true,
  });
  if (mobile) {
    await expect(picker).toBeVisible();
    if ((await picker.getAttribute('aria-expanded')) !== 'true')
      await picker.click();
  }
  const tab = page.getByRole('tab', { name, exact: true, includeHidden: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  if (mobile) {
    await expect(picker).toHaveAttribute('aria-expanded', 'false');
    await expect(picker).toContainText(name);
  }
}

export async function navigate(page: Page, name: string) {
  const label = name;
  const candidates = [
    page.locator('[data-slot=sidebar-menu-button]').filter({ hasText: label }),
    page.locator('.mobile-nav button').filter({ hasText: label }),
  ];
  const visible = async () => {
    for (const locator of candidates) {
      for (let i = 0; i < (await locator.count()); i += 1) {
        const item = locator.nth(i);
        const box = await item.boundingBox();
        if (box && box.x < page.viewportSize()!.width && box.x + box.width > 0)
          return item;
      }
    }
    return undefined;
  };
  const more = page.getByRole('button', { name: 'Mais', exact: true });
  const sidebar = page.getByRole('button', { name: 'Abrir menu', exact: true });
  const tablet =
    (page.viewportSize()?.width ?? 0) >= 768 &&
    (page.viewportSize()?.width ?? 0) < 1024;
  const sidebarState = page.locator('[data-slot=sidebar][data-state]').first();
  if (tablet) {
    await expect(sidebarState).toBeAttached();
    if ((await sidebarState.getAttribute('data-state')) === 'collapsed')
      await sidebar.click();
    await expect(sidebarState).toHaveAttribute('data-state', 'expanded');
  }
  // goto waits for the document, not necessarily for React's first commit.
  // Increase timeout for slower viewports (e.g., 1366) where React mount can take longer
  await expect
    .poll(
      async () =>
        Boolean(await visible()) ||
        (await more.first().isVisible()) ||
        (await sidebar.isVisible()),
      { message: 'Navegação pronta após montagem do React', timeout: 15000 },
    )
    .toBe(true);
  let button = await visible();
  if (!button) {
    if (await sidebar.isVisible()) {
      await sidebar.click();
      await expect
        .poll(async () => Boolean(await visible()), {
          message: `Destino visível no menu: ${name}`,
        })
        .toBe(true);
      button = await visible();
    } else if ((await more.count()) && (await more.first().isVisible())) {
      await more.first().click();
      await expect
        .poll(async () => Boolean(await visible()), {
          message: `Destino visível no menu: ${name}`,
        })
        .toBe(true);
      button = await visible();
    }
  }
  expect(button, `destino navegável visível: ${name}`).toBeDefined();
  await button!.click();
  if (tablet)
    await expect(sidebarState).toHaveAttribute('data-state', 'collapsed');
  await expect(page.locator('[data-mobile=true]')).toHaveCount(0);
}
