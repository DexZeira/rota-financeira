import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { defaults } from '../../src/model';
import { backup } from '../../src/services/storage';
import { navigate, selectSettingsSection } from './navigation';
const key = 'rota-financeira-v1';
test('falha de renderização preserva dados e permite voltar a Configurações', async ({ page, context }) => {
  await localOnly(context); await page.goto('/'); await navigate(page, 'Hoje');
  const before = await page.evaluate(key => localStorage.getItem(key), key);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'format')!;
    Reflect.set(window, 'restoreFormat', () => Object.defineProperty(Intl.NumberFormat.prototype, 'format', descriptor));
    Object.defineProperty(Intl.NumberFormat.prototype, 'format', { ...descriptor, get() {
      const format = descriptor.get!.call(this);
      return () => { void format; throw Error('fixture render failure'); };
    } });
  });
  await navigate(page, 'Dashboard');
  await expect(page.getByRole('region', { name: 'Página indisponível' })).toBeVisible();
  await page.evaluate(() => Reflect.get(window, 'restoreFormat')());
  await page.getByRole('button', { name: 'Voltar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Configurações', exact: true })).toBeVisible();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(before);
});
async function localOnly(context: BrowserContext) {
  await context.route('**/*', (r) =>
    new URL(r.request().url()).hostname === '127.0.0.1'
      ? r.continue()
      : r.fulfill({ status: 503, body: '{}' }),
  );
}
async function settings(page: Page) {
  await navigate(page, 'Configurações');
}
async function theme(page: Page, value = 'escuro') {
  await settings(page);
  await selectSettingsSection(page, 'Aparência');
  await page.locator('.theme-choices').getByRole('button', { name: value === 'escuro' ? 'Escuro' : 'Claro', exact: true }).click();
}
async function editor(page: Page) {
  await navigate(page, 'Trabalho');
  await page
    .getByRole('button', { name: /Registrar trabalho/ })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
test('multiaba preserva formulário e exige atualização explícita', async ({
  page,
  context,
}) => {
  await localOnly(context);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Novo', exact: true }),
  ).toBeVisible();
  const b = await context.newPage();
  await b.goto('/');
  await editor(b);
  const before = await b.locator('.editor-dialog input').first().inputValue();
  await theme(page);
  await expect(b.getByText(/Dados atualizados em outra aba/)).toBeVisible();
  await expect(b.getByRole('dialog')).toBeVisible();
  expect(await b.locator('.editor-dialog input').first().inputValue()).toBe(
    before,
  );
  await expect(
    b.getByRole('button', { name: 'Atualizar dados', includeHidden: true }),
  ).toBeDisabled();
  await b.keyboard.press('Escape');
  await b.getByRole('button', { name: 'Atualizar dados' }).click();
  await expect(b.getByRole('button', { name: 'Atualizar dados' })).toHaveCount(
    0,
  );
});
test('backup de emergência recupera estado após reset controlado, offline', async ({
  page,
  context,
}) => {
  await localOnly(context);
  await page.addInitScript(
    ({ key, d }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(d));
    },
    {
      key,
      d: {
        ...defaults(),
        settings: { ...defaults().settings, openingCash: 321.09 },
      },
    },
  );
  await page.goto('/');
  await settings(page);
  await selectSettingsSection(page, 'Segurança');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar backup de emergência' }).click(),
  ]);
  const bytes = await readFile((await download.path())!);
  const envelope = JSON.parse(bytes.toString());
  expect(envelope.algorithm).toBe('SHA-256');
  expect(envelope.payload.data.settings.openingCash).toBe(32109);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await context.setOffline(true);
  await page.goto('/#recovery');
  await page.reload();
  await page.getByRole('button', { name: 'Iniciar vazio' }).click();
  await page.getByLabel('Confirmação de recuperação').fill('RESTAURAR');
  await page.getByRole('button', { name: 'Confirmar recuperação' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).settings.openingCash,
        key,
      ),
    )
    .toBe(0);
  await page.goto('/#recovery');
  await page.reload();
  await page
    .locator('input[type=file]')
    .setInputFiles({
      name: 'emergency.json',
      mimeType: 'application/json',
      buffer: bytes,
    });
  await page.getByLabel('Confirmação de recuperação').fill('RESTAURAR');
  await page.getByRole('button', { name: 'Confirmar recuperação' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).settings.openingCash,
        key,
      ),
    )
    .toBe(32109);
});
test('corrupção abre recuperação e não substitui bytes sem confirmação', async ({
  page,
  context,
}) => {
  await localOnly(context);
  await page.addInitScript((key) => localStorage.setItem(key, '{invalid'), key);
  await page.goto('/');
  await expect(
    page.getByText(/Não foi possível carregar os dados/),
  ).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    '{invalid',
  );
  await page.getByRole('button', { name: 'Abrir modo de recuperação' }).click();
  await expect(
    page.getByRole('heading', { name: 'Recuperação dos dados' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar vazio' }).click();
  await expect(
    page.getByRole('button', { name: 'Confirmar recuperação' }),
  ).toBeDisabled();
});
test('diagnóstico exporta somente metadados e nunca o conteúdo do erro', async ({
  page,
  context,
}) => {
  await localOnly(context);
  await page.goto('/');
  await settings(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('SEGREDO token email@example.test valor 12345'),
      }),
    ),
  );
  await selectSettingsSection(page, 'Segurança');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Baixar diagnóstico' }).click(),
  ]);
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).not.toMatch(/SEGREDO|12345|email@|token/);
  expect(JSON.parse(text).events.length).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('PWA anuncia atualização sem recarregar ou interromper editor', async ({
  page,
  context,
}) => {
  await localOnly(context);
  await page.addInitScript(() => {
    const worker = Object.assign(new EventTarget(), {
      state: 'installed',
      postMessage: () => sessionStorage.setItem('update-requested', 'yes'),
    });
    const registration = Object.assign(new EventTarget(), {
      waiting: worker,
      installing: null,
      active: null,
    });
    Object.defineProperty(navigator.serviceWorker, 'register', {
      value: async () => registration,
    });
  });
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: 'Atualizar aplicativo' }),
  ).toBeVisible();
  await editor(page);
  await page
    .getByRole('button', { name: 'Atualizar aplicativo', includeHidden: true })
    .evaluate((el: HTMLButtonElement) => el.click());
  await expect(
    page.getByText('Feche o formulário aberto antes de atualizar.'),
  ).toBeVisible();
  expect(
    await page.evaluate(() => sessionStorage.getItem('update-requested')),
  ).toBeNull();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Atualizar aplicativo' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Atualizar aplicativo agora?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Atualizar e recarregar', exact: true }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem('update-requested')),
  ).toBe('yes');
});

async function backend(context: BrowserContext) {
  const id = '11111111-1111-4111-8111-111111111111';
  const user = {
    id,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'fixture@test.invalid',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const jwt = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`;
  let revision = 1;
  let row = {
    data: JSON.parse(backup(defaults())),
    updated_at: '2026-09-27T12:00:01.000001+00:00',
    device_id: 'other',
    schema_version: 6,
  };
  const control = {
    writes: 0,
    reads: 0,
    fail: false,
    failStatus: 503,
    attempts: 0,
    race: false,
    advance: () => {
      revision++;
      row = {
        ...row,
        data: {
          ...row.data,
          data: {
            ...row.data.data,
            settings: { ...row.data.data.settings, openingCash: 90000 },
          },
        },
        updated_at: `2026-09-27T12:00:0${revision}.000001+00:00`,
      };
    },
  };
  await context.route('**/*', async (r) => {
    const url = new URL(r.request().url());
    if (url.hostname === '127.0.0.1') return r.continue();
    const json = (data: unknown, status = 200) =>
      r.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
      });
    if (url.hostname !== 'rota-test.supabase.co') return json({}, 503);
    if (url.pathname === '/auth/v1/token') {
      const b = r.request().postDataJSON()?.email === 'fixture-b@test.invalid';
      const nextUser = b
        ? {
            ...user,
            id: '22222222-2222-4222-8222-222222222222',
            email: 'fixture-b@test.invalid',
          }
        : user;
      const token = b
        ? `${jwt.split('.')[0]}.${Buffer.from(JSON.stringify({ sub: nextUser.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.fixture`
        : jwt;
      return json({
        access_token: token,
        refresh_token: 'fixture-refresh',
        token_type: 'bearer',
        expires_in: 3600,
        user: nextUser,
      });
    }
    if (url.pathname === '/auth/v1/user') return json(user);
    if (url.pathname === '/auth/v1/logout') return r.fulfill({ status: 204 });
    if (control.fail) {
      control.attempts++;
      return json({ message: 'Temporary failure' }, control.failStatus);
    }
    if (
      url.pathname === '/rest/v1/user_app_state' &&
      url.searchParams.get('user_id')?.includes('22222222')
    )
      return json({ ...row, data: JSON.parse(backup(defaults())) });
    if (url.pathname === '/rest/v1/user_app_state') {
      control.reads++;
      return json(row);
    }
    if (url.pathname === '/rest/v1/rpc/save_app_state') {
      control.writes++;
      const body = r.request().postDataJSON();
      if (control.race) {
        control.race = false;
        control.advance();
      }
      if (body.p_expected_updated_at !== row.updated_at) return json([]);
      revision++;
      row = {
        ...row,
        data: body.p_data,
        updated_at: `2026-09-27T12:00:0${revision}.000001+00:00`,
        device_id: body.p_device_id,
      };
      return json([row]);
    }
    return json({}, 404);
  });
  return control;
}
async function login(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /^Abrir menu de/ }).click();
  await page.getByRole('menuitem', { name: 'Entrar ou criar conta', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Email (obrigatório)', { exact: true })
    .fill('fixture@test.invalid');
  await dialog.getByLabel('Senha (obrigatória)', { exact: true }).fill('fixture-password');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    'Sincronizado',
  );
}
test('sync real da aplicação usa CAS: revisão obsoleta exibe conflito e preserva edição', async ({
  page,
  context,
}) => {
  const control = await backend(context);
  await login(page);
  control.race = true;
  await theme(page);
  await expect(page.getByRole('dialog')).toContainText(
    'Seus dados foram alterados em outro dispositivo',
  );
  expect(control.writes).toBe(1);
  const local = await page.evaluate((key) => localStorage.getItem(key), key);
  await page
    .getByRole('button', { name: 'Usar dados da nuvem', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            'rota-cloud-recovery:11111111-1111-4111-8111-111111111111',
          )!,
        ).data.settings.theme,
    ),
  ).toBe(JSON.parse(local!).settings.theme);
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).settings.openingCash,
      key,
    ),
  ).toBe(90000);
});
test('retry tem limite, mantém dados locais e permite nova tentativa explícita', async ({
  page,
  context,
}) => {
  const control = await backend(context);
  await page.clock.install();
  await login(page);
  control.fail = true;
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect.poll(() => control.attempts).toBe(i + 1);
    await expect(page.locator('.account-status')).toHaveAttribute(
      'title',
      /Erro ao sincronizar/,
    );
  }
  await page.clock.fastForward(180_000);
  expect(control.attempts).toBe(3);
  await settings(page);
  await selectSettingsSection(page, 'Perfil');
  control.fail = false;
  await page.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    'Sincronizado',
  );
});
test('sessão expirada pausa sync e não apaga snapshot', async ({
  page,
  context,
}) => {
  const control = await backend(context);
  await page.clock.install();
  await login(page);
  const before = await page.evaluate((key) => localStorage.getItem(key), key);
  control.fail = true;
  control.failStatus = 401;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    /Sessão expirada/,
  );
  await page.clock.fastForward(180_000);
  expect(control.attempts).toBe(1);
  expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(
    before,
  );
});
test('logout A e login B isolam os dados locais e mantêm cópia privada de A', async ({
  page,
  context,
}) => {
  const control = await backend(context);
  await login(page);
  control.advance();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect
    .poll(() =>
      page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)!).settings.openingCash,
        key,
      ),
    )
    .toBe(90000);
  await settings(page);
  await selectSettingsSection(page, 'Perfil');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await page
    .getByRole('button', { name: 'Entrar / Criar conta', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('Email (obrigatório)', { exact: true })
    .fill('fixture-b@test.invalid');
  await dialog.getByLabel('Senha (obrigatória)', { exact: true }).fill('fixture-password');
  await dialog.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    'Sincronizado',
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).settings.openingCash,
      key,
    ),
  ).toBe(0);
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            'rota-cloud-account:11111111-1111-4111-8111-111111111111',
          )!,
        ).data.settings.openingCash,
    ),
  ).toBe(90000);
});
test('offline salva local; reconexão sincroniza, mudança remota seguinte exige escolha', async ({
  page,
  context,
}) => {
  const control = await backend(context);
  await login(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    'Sincronizado',
  );
  await context.setOffline(true);
  await theme(page);
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    /Offline/,
  );
  expect(control.writes).toBe(0);
  await context.setOffline(false);
  await expect(page.locator('.account-status')).toHaveAttribute(
    'title',
    'Sincronizado',
  );
  expect(control.writes).toBe(1);
  await context.setOffline(true);
  await theme(page, 'claro');
  control.advance();
  await context.setOffline(false);
  await expect(page.getByRole('dialog')).toContainText(
    'Seus dados foram alterados em outro dispositivo',
  );
  expect(control.writes).toBe(1);
});
