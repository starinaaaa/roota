INSERT INTO public.email_templates(kind, subject, body)
VALUES ('market_payment_thanks', 'Спасибо за покупку на маркете Roota!',
  'Спасибо, что заглянули к нам на маркет! Ваша покупка {{number}} на {{total}} ₽ оплачена. Ссылку на чек вы найдёте в письме Робокассы «Заказ оплачен».')
ON CONFLICT (kind) DO NOTHING;

UPDATE public.email_templates
SET subject='Спасибо за покупку на маркете Roota! Ваш чек',
    body='Спасибо, что заглянули к нам на маркет! Мы рады, что наша керамика теперь у вас. Сохраните это письмо — по кнопке ниже всегда можно открыть ваш чек.'
WHERE kind='market_receipt'
  AND subject='Ваш чек за покупку на маркете Roota'
  AND body='Спасибо за покупку! Оригинальный чек ФНС доступен по кнопке ниже. Сохраните это письмо, чтобы вернуться к чеку.';
