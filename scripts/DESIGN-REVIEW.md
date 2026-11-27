# Дизайн-ревью ENKA

Для изменения композиции или сценария выбери ближайший удачный экран ENKA и сформулируй главное действие покупателя. Опирайся на действующие шаблоны, токены и контент магазина. Для мелкой правки достаточно проверки затронутого сценария.

- **Baymard** — сверяй конкретный сценарий. Для заказа учитывай оплату при получении. [Страница товара](https://baymard.com/research/product-page) · [Каталог и фильтры](https://baymard.com/research/ecommerce-product-lists) · [Поиск](https://baymard.com/research/ecommerce-search)
- **Refactoring UI** — проверяй иерархию, группировку отступами и визуальный вес основного действия. Используй палитру и типографику ENKA. [Открытая статья](https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886)
- **Impeccable** — используй `critique` вручную для выбранного экрана. Применяй отдельные находки или `polish` в пределах согласованной правки. Для ревью достаточно соответствующих инструкций и снимков Playwright. Используй установку только папки скилла, без автоматического хука и режима `live`. [Critique](https://impeccable.style/docs/critique/) · [Polish](https://impeccable.style/docs/polish/) · [Ручная установка](https://github.com/pbakaus/impeccable#manual-copy-no-node-required)
- **Playwright** — снимай затронутый экран или блок в одинаковых условиях до и после. Сверяй иерархию, отступы, ширину и состояния. Открывай в контексте только нужные снимки или фрагменты DOM. [Снимки Playwright](https://playwright.dev/docs/screenshots)

## Headless-предпросмотр

Собери свежую витрину по `README.md`. Запусти локальный предпросмотр с тестовыми сервисами.

```powershell
node scripts/preview.cjs --mock-services
```

Из корня проекта сделай снимки первого экрана на телефоне и ПК в обеих темах. Для снимка одного элемента передай его CSS-селектор последним аргументом. Метки `before` и `after` сохраняют два набора в разных папках под `.local/design-review/captures/`.

```powershell
node scripts/design-screenshots.cjs http://127.0.0.1:4173/ before
node scripts/design-screenshots.cjs http://127.0.0.1:4173/ after
```

Скрипт открывает один headless-браузер и закрывает его после снимков. Для интерактивных состояний добавь действия в отдельный локальный сценарий Playwright. Проверяй анимацию с обычными настройками движения.

### Локальная установка

Если папка инструментов отсутствует, установи Playwright Core вне пакета витрины. Скрипт использует установленный Chrome с изолированным профилем.

```powershell
$enkaDesignTools = Join-Path (Get-Location).Path '.local/design-review/tools'
New-Item -ItemType Directory -Force -Path $enkaDesignTools | Out-Null
pnpm --dir $enkaDesignTools --ignore-workspace add -E playwright-core@1.65.1 --store-dir "$enkaDesignTools/.local/pnpm-store" --ignore-scripts
```

Для Impeccable возьми `.agents/skills/impeccable` из [релиза 4.11.1](https://github.com/pbakaus/impeccable/releases/tag/skill-v4.11.1) и скопируй в одноимённую папку проекта. На Windows x64 скачай `impeccable-windows-x64.exe` из [релиза движка 0.1.31](https://github.com/pbakaus/impeccable/releases/tag/engine-v0.1.31), сверь SHA-256 с `scripts/engine-checksums.txt` установленного скилла и сохрани как `.agents/skills/impeccable/scripts/bin/windows-x64/impeccable.exe`. Лаунчер найдёт движок рядом со скиллом. Ручной режим закреплён в `.impeccable/config.json`.
