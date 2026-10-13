# Почта ROOTА: hello@roota.moscow

Состояние на 14 октября 2026: домен и DKIM полностью подтверждены в Unisender Go («Все проверки DNS пройдены успешно», «Все проверки DKIM пройдены успешно»). DNS применён в Timeweb Cloud. Существующий API-ключ подключён в .env.local (права 0600, исключён Git) и в переменную приложения roota в Timeweb Cloud после разрешения пользователя. Тест через API принят: job ID 1xGjtR-0002OP-LLjy, доставлен во входящие hello@roota.moscow в 00:18 МСК. Отправитель ROOTА, reply-to hello@roota.moscow. Обновление 14 октября: почтовые сценарии реализованы и включены для новых событий, очередь запускается каждую минуту. Контрольное письмо через рабочую очередь доставлено; подписанный webhook записал `delivered` для job ID `1xGlGu-00038X-5tkc`. Управление — `/admin/messages`, подробности — [EMAIL-FLOWS.md](EMAIL-FLOWS.md). Раздельные проекты ожидают включения поддержкой Unisender; запрос отправлен по разрешению владельца.

Отправитель: `ROOTA <hello@roota.moscow>`. Ответы покупателей: `hello@roota.moscow`. Автоматические письма отправляются через Unisender Go; пароль почтового ящика для этого не нужен.

## DNS

DNS-зона обслуживается ns1/ns2.timeweb.ru и ns3/ns4.timeweb.org, но управляется в **Timeweb Cloud**: https://timeweb.cloud/my/domains/dns?fqdn=roota.moscow. Доступ к панели управления доменом отдельный от доступа в почту. Названия NS сами по себе не определяют, в какой панели находится аккаунт.

Входящие MX уже настроены: mx1.timeweb.ru (10), mx2.timeweb.ru (20). Их сохраняем.

Изменить единственную SPF TXT-запись на корне домена:

```text
v=spf1 include:_spf.timeweb.ru include:spf.unisender.ru ~all
```

Добавить TXT на корень домена (TTL 1800):

```text
unisender-go-validate-hash=be6f1b1000881f367bcc0ee1b5ac0ae4
```

Добавить TXT `gokey._domainkey` (TTL 1800). Это публичный ключ, не секрет:

```text
v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCzrQnoYM/KzLzLO4FgI6+pGK9Gei/CT2i2ToQY6esuZUWhtzOWdbmYMtFwKzhi3lw42ZBsN+bNm5dlYhtqFVQ7MeCnqqYJt3lWk1PmUetou/6YBiYMCyXCflYjLdp0QJXgzWYowwjJojCn5vcwmzaykwoxFB/XCuI6hv28vY2DPwIDAQAB
```

Существующий DMARC `_dmarc` с `v=DMARC1; p=none;` сохраняем. Unisender допускает существующий DMARC; предлагаемый CNAME вместо него не требуется.

Домен ссылок `click.roota.moscow`: в Timeweb Cloud форма DNS поддерживает CNAME, но не NS. Использован альтернативный вариант, предоставленный кабинетом Unisender Go (TTL 600):

```text
click.roota.moscow CNAME 60729.order.msgpanel.com
dkey._domainkey.click.roota.moscow CNAME dkim.60729.order.msgpanel.com
```

Записи применены после подтверждения пользователя. SPF обновлён, TXT подтверждения и DKIM добавлены, оба CNAME добавлены. TTL всех фактических записей — 600. NS основного домена, A сайта, Timeweb DKIM, DMARC и MX сохранены. Настройка разрешает Unisender отправлять письма от домена и обслуживать поддомен ссылок. Домены ссылок в кабинете: click.roota.moscow, статус «Настроен». 14 октября проверка владения и DKIM успешна.

## Код и проверка

- `lib/email/unisender-transport.ts`: отправка через HTTPS API, фиксированные From/Reply-To, таймаут, без слепых повторов при неопределённом результате и без утечки ошибок провайдера.
- `lib/email/server.ts`: серверная обёртка, автоматическая отправка выключена без `CUSTOMER_EMAILS_ENABLED=true`. Подключены события заказов и постоянная очередь; правила согласий, отписки, поступлений, корзины и отзывов описаны в EMAIL-FLOWS.md.
- `node --import tsx scripts/test-email.ts`: только один фиксированный получатель студии; запуск вручную, не при сборке. Каждый запуск создаёт отдельное тестовое письмо; после неопределённого результата проверить доставку до нового запуска.
- Четыре теста транспорта, TypeScript, ESLint и production build прошли. API acceptance и фактическая доставка подтверждены отдельно.

## Проверка после настройки

1. Проверить записи на авторитетных NS и через публичный DNS.
2. В Unisender Go проверить домен: подтверждение и DKIM должны стать активными.
3. Проверить домен ссылок отдельно.
4. Подключить существующий API-ключ через секреты сервера, без Git и вывода в отчёты.
5. Отправить тестовое письмо на собственный подтверждённый адрес и проверить доставку, SPF/DKIM/DMARC и ответ в hello@roota.moscow. Клиентская рассылка до проверки не запускается.

Источники: https://godocs.unisender.ru/dns-setup, https://godocs.unisender.ru/.
