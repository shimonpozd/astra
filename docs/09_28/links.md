Как работает GET /api/links/{tref}
1) Назначение

Возвращает список всех связей (links) для переданного текста tref — комментарии, параллели, «месорат hа-шас», родственные места, и т.д. Это список объектов (массив), где каждый элемент описывает одну связь.

Пример tref:
Mishnah Peah 4:2, Shabbat 12a:5, Berakhot 14b:2, Genesis 1:1–3.

2) Параметры запроса

with_text (0/1, по умолчанию 1) — включать ли текст связанного отрывка (англ/иврит) в объекте связи.
Для скоростных списков и для Bookshelf обычно **

You said:
В фомате markdown 
ChatGPT said:
Инструкция: как правильно использовать GET /api/links/{tref} (Sefaria)

Практично, по пунктам. Ориентировано на разработчика, чтобы быстро получать все нужные данные для Bookshelf и других UI-модулей.

1) Назначение и базовая идея

GET https://www.sefaria.org/api/links/{tref} возвращает массив объектов-связей (links) для текста tref.
Каждый объект описывает одну связь: комментарий, параллель, месорат-hа-шас, related-passage, responsa и т.д.

Вход: tref — валидная ссылка на текст (например: Mishnah Peah 4:2, Shabbat 12a:5).

Важно: URL-кодируйте tref (Shabbat 12a:5 → Shabbat%2012a%3A5).

2) Полезные query-параметры

with_text (0/1, по умолчанию 1): включать ли текст в полях text (EN) и he (HE) у каждой связи.
Для быстрой ленты/списка: ставьте with_text=0, чтобы не тянуть тяжёлые тексты.

with_sheet_links (0/1, по умолчанию 0): включать ли ссылки на Sefaria Source Sheets (пользовательские подборки).

Примеры:

GET /api/links/Shabbat%2012a%3A5?with_text=0&with_sheet_links=0
GET /api/links/Mishnah%20Peah%204%3A2?with_text=1

3) Структура объекта связи (что реально нужно)

Каждый элемент массива — объект со следующими (наиболее полезными) полями:

Поле	Назначение	Комментарий
_id	ID связи	Можно использовать для дедупликации.
index_title	Каноническое название источника	Например, “Bartenura on Mishnah Peah”.
category	Категория	Commentary, Talmud, Midrash, Responsa, Halakhah, и т.п.
type	Тип связи	Часто commentary, reference, mesorat hashas, related passage…
ref	Ссылка на связанный текст	То, куда ведёт связь (что показываем по клику).
anchorRef	Якорный ref	То, для чего мы запросили связи (может быть диапазон).
anchorRefExpanded	Массив segment-ref’ов	Если anchorRef — диапазон, тут перечислены сегменты.
sourceRef / sourceHeRef	Источник	Альтернативная привязка к источнику (иногда совпадает с ref).
collectiveTitle.en/he	Короткое имя корпуса	Удобно для бэджей/лейблов.
compDate	Год/диапазон создания	Может быть [], [YYYY] или [YYYY1, YYYY2].
text	Английский текст (если with_text=1)	Может быть строкой или массивом (JaggedArray).
he	Иврит/арамейский текст (если with_text=1)	Может быть строкой или массивом.
versionTitle/heVersionTitle	Название версии	Для подписи/атрибуции.
license/heLicense	Лицензия	Для корректного отображения/экспорта.

Практика: для списков/Bookshelf достаточно ref, index_title, category, type, collectiveTitle, compDate. Превью делайте через другой вызов текстов (или with_text=1 только при раскрытии карточки).

4) Категории и как их «разруливать»

Поле category — высокоуровневое семейство:

Commentary — комментарии на базовый текст (Bartenura, Tosafot Yom Tov, и т.д.).

Talmud, Midrash, Halakhah, Responsa, Quoting Commentary, Mishnah, и пр.

type уточняет природу связи: commentary, reference, related passage, mesorat hashas, пустая строка и т.п.

Как отбирать по категориям:

Фильтруйте по category для вкладок (Commentary, Responsa, Talmud…).

Для особых режимов: учитывайте type (например, показать только commentary или только related passage).

5) Нормализация ref (чтобы Bookshelf «жил»)

Иногда целевой реф тривиально лежит в ref. Иногда полезен sourceRef. Рекомендуется завести нормализатор:

Возьмите ref, если не пусто.

Иначе anchorRef (но помните — это «якорь», а не ссылка на связанный текст).

Иначе sourceRef.

Продублируйте как metadata.ref для совместимости.

Мини-адаптер (логика на уровне бэкенда/серверного агрегатора):

function normalizeLinkItem(li) {
  const ref = li.ref || li.sourceRef || li.anchorRef || "";
  return {
    ...li,
    ref,
    metadata: { ...(li.metadata || {}), ref }
  };
}

6) Превью текста: когда и как тянуть

Список/лента: with_text=0 (быстро). Превью подгружайте лениво на раскрытии элемента через Texts API v3 (желательно — двуязычно).

Альтернатива: with_text=1 только если у вас мало элементов и нужен быстрый просмотр.

Важно: поля text/he могут быть строкой или массивом строк (JaggedArray).
Унификация:

function coalesceText(val, join = "\n") {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (Array.isArray(val)) return val.flat(Infinity).filter(Boolean).join(join);
  return "";
}

7) Как получить «все нужные данные» по всем категориям

Сделайте один запрос:

GET /api/links/{encoded_tref}?with_text=0&with_sheet_links=0


Разбейте массив по category (и при желании по type).

Для каждой группы:

Сортируйте (например, по index_title, затем по compDate[0], затем по commentaryNum).

Нормализуйте ref (см. §5).

Для превью при открытии карточки — запросите текст отдельным эндпоинтом Texts v3.

8) Примеры
8.1. cURL
curl "https://www.sefaria.org/api/links/Shabbat%2012a%3A5?with_text=0&with_sheet_links=0"

8.2. JavaScript/TypeScript (fetch)
async function fetchLinks(tref: string, opts = { with_text: 0, with_sheet_links: 0 }) {
  const url = new URL(`https://www.sefaria.org/api/links/${encodeURIComponent(tref)}`);
  url.searchParams.set("with_text", String(opts.with_text ?? 0));
  url.searchParams.set("with_sheet_links", String(opts.with_sheet_links ?? 0));

  const resp = await fetch(url.toString());
  if (!resp.ok) throw new Error(`links fetch failed: ${resp.status}`);
  const data = await resp.json();
  if (!Array.isArray(data)) throw new Error("links: expected array");
  return data.map(normalizeLinkItem); // см. §5
}

function groupByCategory(links: any[]) {
  return links.reduce((acc, li) => {
    const cat = li.category || "Other";
    (acc[cat] ||= []).push(li);
    return acc;
  }, {} as Record<string, any[]>);
}

8.3. Python (requests)
import requests, urllib.parse

def fetch_links(tref: str, with_text=0, with_sheet_links=0):
    url = f"https://www.sefaria.org/api/links/{urllib.parse.quote(tref)}"
    r = requests.get(url, params={"with_text": with_text, "with_sheet_links": with_sheet_links}, timeout=15)
    r.raise_for_status()
    data = r.json()
    assert isinstance(data, list), "links: expected list"
    return [normalize_link_item(li) for li in data]

def normalize_link_item(li: dict) -> dict:
    ref = li.get("ref") or li.get("sourceRef") or li.get("anchorRef") or ""
    md = dict(li.get("metadata") or {})
    md.setdefault("ref", ref)
    li["ref"] = ref
    li["metadata"] = md
    return li

9) Дедупликация и сортировка

Дедуп: по _id; если _id отсутствует — по паре (ref, index_title) (и/или collectiveTitle.en) с нормализацией пробелов/регистра.

Сортировка (пример, стабильно для UI):

category (фиксированный порядок вкладок: Commentary → Talmud → Halakhah → Responsa → …)

index_title (лексикографически)

commentaryNum (если есть)

compDate[0] (если есть)

10) Частые ловушки (и как их избегать)

Не URL-кодируете tref → 200 с «пустым» смыслом / или 404.

Жёстко предполагаете, что ответ — dict → а это массив. Проверяйте тип.

Ожидаете, что ref всегда есть → в ряде случаев он в sourceRef. Делайте нормализацию (§5).

Считаете, что text/he — всегда строка → нередко это массивы массивов. Утилизируйте coalesceText.

Отсутствуют фильтры → слишком «шумный» список. Фильтруйте по category/type.

Тянете with_text=1 для больших списков → долгие ответы. Тяните тексты отложенно.

11) Рекомендуемый пайплайн для Bookshelf

GET /api/links/{tref}?with_text=0&with_sheet_links=0

Нормализуем ref в каждом элементе.

Группируем по category (и при необходимости по type).

Рендерим списки.

При раскрытии карточки — подгружаем текст через Texts v3 (двуязычно, version=english&version=hebrew, парсим versions[]).

Превью формируем на клиенте (coalesceText с \n).

12) Мини-контрольный чек-лист

 Ответ — массив; элементы не «теряются» (нет неожиданных .get("links")).

 Каждый элемент после нормализации имеет ref (строка).

 Категории разбиты корректно; счётчики по вкладкам > 0 там, где ожидается.

 При необходимости текст догружается отдельно и склеивается корректно (строка/массив).

 Нет падений при отсутствии versionTitle/license и т.п. (поля опциональны).

13) Мини-FAQ

Можно ли одной ссылкой получить «только комментарии»?
В этом эндпоинте — нет, фильтруйте на клиенте по category="Commentary" и/или type="commentary".

Что делать с ranged-refs (anchorRefExpanded)?
Это подсказка «какие именно сегменты» входит диапазон. Для группировки обычно игнорируйте, а для точной привязки подсветок используйте по месту.

Где брать двуязычный текст связанного ref?
Через GET /api/v3/texts/{ref}?version=english&version=hebrew&return_format=text_only и парсить versions[] (EN/HE).