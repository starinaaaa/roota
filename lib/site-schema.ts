import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
const social = z
  .string()
  .url()
  .max(300)
  .refine((v) => v.startsWith("https://"), "Используйте https-ссылку");
const item = z.object({ title: text(100), text: text(1500) });
const deliveryCostText =
  "Стоимость доставки Ozon рассчитывается после выбора пункта выдачи и показывается до оплаты. Ориентировочный срок указан рядом с выбранным пунктом и в итогах заказа. Он отсчитывается с момента передачи посылки Ozon; время подготовки заказа добавляется отдельно. Если срок пока не рассчитан, уточните его у студии до оплаты.";
const legacyDeliveryCostText =
  "Стоимость доставки рассчитывается после выбора пункта выдачи и показывается в составе заказа до оплаты. Если Ozon возвращает ориентировочный срок, вы увидите его там же: он отсчитывается после передачи посылки перевозчику.";
export const siteSchema = z.object({
  browserIcon: z
    .string()
    .regex(/^(?:|\/site-media\/[a-f0-9-]{36})$/)
    .default(""),
  shareImage: z
    .string()
    .regex(/^(?:|\/site-media\/[a-f0-9-]{36})$/)
    .default(""),
  heroTitle: text(120),
  heroIntro: text(600),
  heroImage: z
    .string()
    .regex(/^\/(?:images\/[a-zA-Z0-9_.-]+|site-media\/[a-f0-9-]{36})$/),
  studioStatement: text(160),
  studioSummary: text(600),
  studioTitle: text(160),
  studioIntro: text(2500),
  processText: text(2500),
  materialsText: text(2500),
  studioQuote: text(600),
  email: z.string().email().max(254),
  telegram: social.transform((url) =>
    // Upgrade published settings and drafts that still use the old contact.
    /^https:\/\/t\.me\/rootaceramics\/?$/i.test(url)
      ? "https://t.me/rav_no"
      : url,
  ),
  instagram: social,
  delivery: z
    .array(item)
    .min(1)
    .max(8)
    .transform((items) =>
      // Upgrade the old published copy and drafts, preserving later editor changes.
      items.map((entry) =>
        entry.text === legacyDeliveryCostText
          ? { ...entry, text: deliveryCostText }
          : entry,
      ),
    ),
  payment: z.array(item).min(1).max(8),
  featuredIds: z
    .array(z.string().uuid())
    .max(12)
    .refine((v) => new Set(v).size === v.length),
});
export type SiteContent = z.infer<typeof siteSchema>;
export const defaultSite: SiteContent = {
  browserIcon: "",
  shareImage: "",
  heroTitle: "Каждое изделие —\nотдельная история",
  heroIntro:
    "Ручная керамика для дома — спокойные формы, живые поверхности и вещи, которые хочется держать рядом каждый день.",
  heroImage: "/images/hero-bg.jpg",
  studioStatement: "Мы делаем керамику,\nкоторую хочется\nтрогать руками.",
  studioSummary:
    "Каждое изделие проходит через руки мастера от начала до конца. Никакого потока. Только внимание к форме, фактуре и смыслу.",
  studioTitle: "Керамика, которая\nживёт рядом с вами",
  studioIntro:
    "Roota ceramics — мастерская авторской керамики в Москве. Мы не производим серии. Каждое изделие создаётся вручную: от первого касания глины до финальной обжиговой печи.\n\nЗа студией стоит небольшая команда — люди, для которых керамика это не просто ремесло, а способ замедлиться и сделать что-то настоящее.",
  processText:
    "Мы работаем на гончарном круге и вручную. Никаких пресс-форм, никакой автоматизации. Каждое изделие проходит этапы формовки, сушки, первого обжига, глазурования и финального обжига — всё в нашей мастерской.\n\nИменно поэтому две тарелки из одной коллекции никогда не будут идентичными. Небольшие различия в форме и цвете — это не погрешность, а подпись мастера.",
  materialsText:
    "Мы используем каменную массу высокотемпературного обжига — плотную, долговечную, хорошо держащую форму. Глазури готовим сами: от матовых кремовых до глубоких пепельных тонов.\n\nПравила ухода и допустимые способы использования указаны в карточке каждого изделия.",
  studioQuote:
    "«Нам важно, чтобы каждый предмет нёс в себе что-то тихое — ощущение, что он был сделан с намерением.»",
  email: "hello@roota.moscow",
  telegram: "https://t.me/rav_no",
  instagram: "https://instagram.com/roota.ceramics",
  delivery: [
    {
      title: "Доставка в пункты Ozon",
      text: "При оформлении заказа выберите город, затем удобный пункт Ozon на карте или в списке.",
    },
    {
      title: "Стоимость и срок доставки",
      text: deliveryCostText,
    },
    {
      title: "Подготовка к отправке",
      text: "Готовые изделия отправляем за 1–3 рабочих дня после оплаты. Срок изготовления предзаказа указан в карточке изделия.",
    },
  ],
  payment: [
    {
      title: "Оплата после подтверждения",
      text: "После подтверждения заказа мы согласуем способ оплаты и пришлём реквизиты.",
    },
  ],
  featuredIds: [],
};
