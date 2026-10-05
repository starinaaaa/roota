import { z } from "zod";
const text = (max: number) => z.string().trim().min(1).max(max);
const social = z
  .string()
  .url()
  .max(300)
  .refine((v) => v.startsWith("https://"), "Используйте https-ссылку");
const item = z.object({ title: text(100), text: text(1500) });
export const siteSchema = z.object({
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
  telegram: social,
  instagram: social,
  delivery: z.array(item).min(1).max(8),
  payment: z.array(item).min(1).max(8),
  featuredIds: z
    .array(z.string().uuid())
    .max(12)
    .refine((v) => new Set(v).size === v.length),
});
export type SiteContent = z.infer<typeof siteSchema>;
export const defaultSite: SiteContent = {
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
  telegram: "https://t.me/rootaceramics",
  instagram: "https://instagram.com/roota.ceramics",
  delivery: [
    {
      title: "Курьером по Москве",
      text: "Доставка в течение 1–2 дней. Стоимость — от 400 ₽. Бесплатно при заказе от 5 000 ₽.",
    },
    {
      title: "СДЭК / Почта России",
      text: "Отправляем по всей России. Срок — 3–7 рабочих дней в зависимости от региона. Стоимость доставки уточняется после оформления заказа.",
    },
    {
      title: "Самовывоз",
      text: "Забрать заказ можно из нашей мастерской в Москве. Адрес и время — по договорённости после оформления.",
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
