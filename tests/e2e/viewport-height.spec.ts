import { test, expect } from '@playwright/test';
import { navigate } from './navigation';

test('bem patrimonial mantém primeiro e último campos e ações dentro da viewport', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Patrimônio');
  await page
    .getByRole('button', { name: 'Cadastrar bem', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === 'running').length,
      ),
    )
    .toBe(0);
  const bounds = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      v = window.visualViewport;
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      height: v?.height ?? innerHeight,
      width: v?.width ?? innerWidth,
      offset: v?.offsetTop ?? 0,
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(bounds.offset - 1);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.offset + bounds.height + 1);
  expect(bounds.left).toBeGreaterThanOrEqual(-1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.width + 1);
  await dialog.getByLabel('Nome', { exact: false }).fill('Bem acessível');
  const notes = dialog.getByRole('textbox', {
    name: 'Observações',
    exact: true,
  });
  await notes.scrollIntoViewIfNeeded();
  await notes.fill('Último campo');
  expect(
    await notes.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        footer = el
          .closest('.editor-dialog')!
          .querySelector('.form-actions')!
          .getBoundingClientRect();
      return (
        document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2,
        ) === el && r.top + r.height / 2 < footer.top
      );
    }),
  ).toBe(true);
  await expect(
    dialog.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeInViewport();
});

test('editor de orçamento cabe na visual viewport e mantém ações acessíveis', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Gastos');
  await page
    .getByText('Quanto posso gastar? · Orçamento do mês', { exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Criar orçamento', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === 'running').length,
      ),
    )
    .toBe(0);
  const box = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      v = visualViewport;
    return {
      left: r.left,
      right: r.right,
      top: r.top,
      bottom: r.bottom,
      width: v?.width ?? innerWidth,
      height: v?.height ?? innerHeight,
      offset: v?.offsetTop ?? 0,
    };
  });
  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(box.width + 1);
  expect(box.top).toBeGreaterThanOrEqual(box.offset - 1);
  expect(box.bottom).toBeLessThanOrEqual(box.height + box.offset + 1);
  await dialog
    .getByLabel('Categoria', { exact: false })
    .fill('Categoria comprida com espaços');
  const last = dialog.getByLabel('Próximo do limite a partir de (%)', {
    exact: true,
  });
  await last.scrollIntoViewIfNeeded();
  await last.fill('95');
  await expect(
    dialog.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test('editor de recorrência mantém campos e ações acessíveis na visual viewport', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Planejamento');
  await page
    .getByRole('button', { name: 'Nova recorrência', exact: true })
    .click();
  const dialog = page.locator('.editor-dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === 'running').length,
      ),
    )
    .toBe(0);
  const box = await dialog.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      v = visualViewport;
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: v?.width ?? innerWidth,
      height: v?.height ?? innerHeight,
      offset: v?.offsetTop ?? 0,
    };
  });
  expect(box.top).toBeGreaterThanOrEqual(box.offset - 1);
  expect(box.bottom).toBeLessThanOrEqual(box.offset + box.height + 1);
  expect(box.left).toBeGreaterThanOrEqual(-1);
  expect(box.right).toBeLessThanOrEqual(box.width + 1);
  await dialog.getByLabel('Nome', { exact: false }).fill('Recorrência mobile');
  const notes = dialog.getByRole('textbox', {
    name: 'Observações',
    exact: true,
  });
  await notes.scrollIntoViewIfNeeded();
  await notes.fill('Último campo acessível');
  const geometry = await notes.evaluate((el) => {
    const field = el.getBoundingClientRect(),
      footer = el
        .closest('.editor-dialog')!
        .querySelector('.form-actions')!
        .getBoundingClientRect();
    return { center: field.top + field.height / 2, footer: footer.top };
  });
  expect(geometry.center).toBeLessThanOrEqual(geometry.footer);
  await expect(
    dialog.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test('editor respeita a visual viewport em alturas móveis', async ({
  page,
}) => {
  await page.goto('/');
  await navigate(page, 'Dívidas');
  await page
    .getByRole('button', { name: '+ Nova dívida', exact: true })
    .click();
  const dialog = page.locator('.editor-dialog');
  await expect(dialog).toBeVisible();
  await expect
    .poll(
      async () =>
        dialog.evaluate((el) => {
          const transform = getComputedStyle(el).transform;
          if (transform === 'none') return true;
          const match = transform.match(/^matrix(3d)?\((.+)\)$/);
          if (!match) return false;
          const values = match[2].split(',').map(Number);
          const scaleX = values[0];
          const scaleY = match[1] ? values[5] : values[3];
          return (
            Number.isFinite(scaleX) &&
            Number.isFinite(scaleY) &&
            Math.abs(scaleX - 1) < 0.001 &&
            Math.abs(scaleY - 1) < 0.001
          );
        }),
      { timeout: 3000, intervals: [50, 100, 200] },
    )
    .toBe(true);
  const geometry = await dialog.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const visual = window.visualViewport;
    const style = getComputedStyle(el);
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      viewportWidth: visual?.width ?? window.innerWidth,
      viewportHeight: visual?.height ?? window.innerHeight,
      offsetTop: visual?.offsetTop ?? 0,
      innerWidth: window.innerWidth,
      devicePixelRatio: window.devicePixelRatio,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bodyScrollWidth: document.body.scrollWidth,
      computedWidth: style.width,
      maxWidth: style.maxWidth,
      transform: style.transform,
      translate: style.translate,
      boxSizing: style.boxSizing,
      padding: style.padding,
      border: style.border,
      bodyScrollable:
        (el.querySelector('.editor-body') as HTMLElement | null)
          ?.scrollHeight || 0,
      bodyClient:
        (el.querySelector('.editor-body') as HTMLElement | null)
          ?.clientHeight || 0,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.offsetTop - 1);
  expect(geometry.bottom).toBeLessThanOrEqual(
    geometry.offsetTop + geometry.viewportHeight + 1,
  );
  expect(geometry.left).toBeGreaterThanOrEqual(-1);
  const horizontalTolerance =
    geometry.scrollWidth <= geometry.clientWidth &&
    geometry.bodyScrollWidth <= geometry.clientWidth
      ? 2
      : 1;
  expect(geometry.right).toBeLessThanOrEqual(
    geometry.viewportWidth + horizontalTolerance,
  );
  await expect(
    dialog.getByRole('button', { name: 'Cancelar', exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Salvar', exact: true }),
  ).toBeVisible();
  await dialog.getByLabel('Nome *', { exact: true }).fill('Altura QA');
  await dialog.locator('input[type=date]').first().scrollIntoViewIfNeeded();
  await expect(dialog.locator('input[type=date]').first()).toBeVisible();
});
