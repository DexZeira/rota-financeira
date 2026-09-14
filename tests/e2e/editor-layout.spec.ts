import { test, expect } from '@playwright/test';

// Run against vite preview: development CSS did not reproduce this regression.
test('production editors stay inside the viewport with accessible actions', async ({ page }) => {
  await page.goto('/');
  for (const name of ['Trabalho', 'Gasto', 'Aporte', 'Manutenção', 'Investimento', 'Dívida']) {
    if (name === 'Investimento' || name === 'Dívida') {
      const nav = page.getByRole('button', { name: name === 'Investimento' ? 'Investimentos' : 'Dívidas', exact: true }).filter({ visible: true });
      if (!await nav.count()) await page.getByRole('button', { name: 'Mais', exact: true }).click();
      await nav.first().click();
      await page.getByRole('button', { name: name === 'Investimento' ? '+ Novo investimento' : '+ Nova dívida', exact: true }).click();
    } else {
      await page.locator('.quick-add-trigger').click();
      await page.getByRole('menuitem', { name, exact: true }).click();
    }
    const dialog = page.locator('.editor-dialog');
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1;
    }), { message: `${name}: popup geometry` }).toBe(true);
    const overflow = await dialog.evaluate(el => {
      const r = el.getBoundingClientRect();
      return [...el.querySelectorAll<HTMLElement>('*')].filter(child => {
        const s = getComputedStyle(child), c = child.getBoundingClientRect();
        // Base UI's visually hidden form inputs deliberately have a 1px box.
        if (s.display === 'none' || s.clipPath !== 'none' || s.getPropertyValue('clip') !== 'auto' || !c.width || !c.height) return false;
        return c.left < r.left - 1 || c.right > r.right + 1;
      }).map(child => `${child.tagName}.${child.className}`);
    });
    expect(overflow, `${name}: overflowing descendants`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const save = dialog.getByRole('button', { name: 'Salvar', exact: true });
    await save.scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport({ ratio: 1 });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
});
