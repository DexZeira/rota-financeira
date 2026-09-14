import { test, expect } from '@playwright/test';
import { navigate } from './navigation';

test('editor respeita a visual viewport em alturas móveis', async ({ page }) => {
  await page.goto('/');
  await navigate(page, 'Dívidas');
  await page.getByRole('button', { name: '+ Nova dívida', exact: true }).click();
  const dialog = page.locator('.editor-dialog');
  await expect(dialog).toBeVisible();
  await expect.poll(async () => dialog.evaluate((el) => {
    const transform = getComputedStyle(el).transform;
    if (transform === 'none') return true;
    const match = transform.match(/^matrix(3d)?\((.+)\)$/);
    if (!match) return false;
    const values = match[2].split(',').map(Number);
    const scaleX = values[0];
    const scaleY = match[1] ? values[5] : values[3];
    return Number.isFinite(scaleX) && Number.isFinite(scaleY) && Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001;
  }), { timeout: 3000, intervals: [50, 100, 200] }).toBe(true);
  const geometry = await dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const visual = window.visualViewport;
    const style = getComputedStyle(el);
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, viewportWidth: visual?.width ?? window.innerWidth, viewportHeight: visual?.height ?? window.innerHeight, offsetTop: visual?.offsetTop ?? 0, innerWidth: window.innerWidth, devicePixelRatio: window.devicePixelRatio, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, bodyScrollWidth: document.body.scrollWidth, computedWidth: style.width, maxWidth: style.maxWidth, transform: style.transform, translate: style.translate, boxSizing: style.boxSizing, padding: style.padding, border: style.border, bodyScrollable: (el.querySelector('.editor-body') as HTMLElement | null)?.scrollHeight || 0, bodyClient: (el.querySelector('.editor-body') as HTMLElement | null)?.clientHeight || 0 };
  });
  console.log('viewport-height diagnostic', geometry);
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.offsetTop - 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.offsetTop + geometry.viewportHeight + 1);
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  const horizontalTolerance = geometry.scrollWidth <= geometry.clientWidth && geometry.bodyScrollWidth <= geometry.clientWidth ? 2 : 1;
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + horizontalTolerance);
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Salvar', exact: true })).toBeVisible();
  await dialog.getByLabel('Nome *', { exact: true }).fill('Altura QA');
  await dialog.locator('input[type=date]').first().scrollIntoViewIfNeeded();
  await expect(dialog.locator('input[type=date]').first()).toBeVisible();
});
