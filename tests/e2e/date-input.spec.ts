import { test, expect } from '@playwright/test';
import { navigate } from './navigation';

for (const flow of ['Trabalho', 'Gasto', 'Dívida', 'Manutenção']) {
  test(`${flow}: native date click, editing and saved date-only round trip`, async ({ page }) => {
    await page.goto('/');
    const name = `QA ${flow}`;
    const section = flow === 'Gasto' ? 'Gastos' : flow === 'Dívida' ? 'Dívidas' : flow;
    await navigate(page, section);
    if (flow === 'Manutenção') {
      await page.getByText('Gerenciar intervalos e itens', { exact: true }).click();
      await page.getByRole('button', { name: 'Adicionar', exact: true }).first().click();
    } else {
      const button = flow === 'Trabalho' ? '+ Registrar trabalho' : flow === 'Gasto' ? '+ Registrar gasto' : '+ Nova dívida';
      await page.getByRole('button', { name: button, exact: true }).click();
    }
    const dialog = page.locator('.editor-dialog');
    if (flow === 'Trabalho') {
      await dialog.getByLabel('Nome da atividade *').fill(name);
      await dialog.getByLabel('Horas *', { exact: true }).fill('2');
    }
    else await dialog.getByLabel('Nome *', { exact: true }).fill(name);
    if (flow === 'Dívida') {
      await dialog.getByLabel('Total de parcelas', { exact: true }).fill('12');
      await dialog.getByLabel('Valor da parcela (R$) *', { exact: true }).fill('100');
    }
    const input = dialog.locator('input[type=date]').first();
    const viewportBefore = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, visualWidth: window.visualViewport?.width, visualHeight: window.visualViewport?.height }));
    await input.scrollIntoViewIfNeeded();
    await expect(input).toBeVisible();
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const after = await input.boundingBox();
    expect(after, 'input[type=date] deve ter geometria após scroll').not.toBeNull();
    expect(after!.x).toBeGreaterThanOrEqual(-1);
    expect(after!.x + after!.width).toBeLessThanOrEqual((viewportBefore.visualWidth || viewportBefore.innerWidth) + 1);
    expect(after!.y).toBeGreaterThanOrEqual(-1);
    expect(after!.y + after!.height).toBeLessThanOrEqual((viewportBefore.visualHeight || viewportBefore.innerHeight) + 1);
    const hit = await input.evaluate((el: HTMLInputElement) => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === el;
    });
    expect(hit).toBe(true);
    await expect(input).toBeEnabled();
    await input.evaluate((el: HTMLInputElement) => {
      const original = el.showPicker?.bind(el);
      if (!original) return;
      el.showPicker = function () {
        original();
        this.dataset.pickerOpened = 'true';
      };
    });
    await input.click();
    await expect(input).toBeFocused();
    if (await input.evaluate(el => typeof (el as HTMLInputElement).showPicker === 'function')) {
      await expect(input).toHaveAttribute('data-picker-opened', 'true');
      await page.keyboard.press('Escape');
    }
    await expect(dialog).toBeVisible();
    const date = await page.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    });
    await input.fill(date);
    await expect(input).toHaveValue(date);
    await input.fill('');
    await expect(input).toHaveValue('');
    await input.fill(date);
    await dialog.getByRole('button', { name: 'Salvar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // Reopen through the real UI, after reloading persisted local state.
    await page.reload();
    await navigate(page, section);
    if (flow === 'Dívida') await page.getByText('Ver todas as dívidas', { exact: true }).click();
    if (flow === 'Manutenção') await page.getByText('Gerenciar intervalos e itens', { exact: true }).click();
    if (flow !== 'Gasto') await page.getByRole('button', { name: `Ações de ${name}`, exact: true }).first().click();
    await page.getByRole('button', { name: `Editar ${name}`, exact: true }).first().click();
    await expect(dialog.locator('input[type=date]').first()).toHaveValue(date);
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });
}
