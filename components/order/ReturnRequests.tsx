import { customerReturnState } from "@/lib/customer-returns";
import { requestStatuses, returnReasons } from "@/lib/delivery/return-model";
import ReturnRequestForm from "./ReturnRequestForm";
export default async function ReturnRequests({
  orderId,
  token,
  eligible,
}: {
  orderId: string;
  token: string;
  eligible: boolean;
}) {
  const state = await customerReturnState(orderId);
  if (!state.available || (!eligible && !state.requests.length)) return null;
  return (
    <section className="space-y-4" aria-label="Обращения по возврату">
      {state.requests.map((request) => (
        <article
          key={request.id}
          className="border border-stone-200 p-4 space-y-2"
        >
          <h3>{requestStatuses[request.status]}</h3>
          <p>{returnReasons[request.reason]}</p>
          <p className="whitespace-pre-wrap">{request.description}</p>
          {request.studio_reply ? (
            <p className="whitespace-pre-wrap">
              Ответ студии: {request.studio_reply}
            </p>
          ) : (
            <p>
              Рассмотрим заявку и свяжемся с вами. Не отправляйте изделие до
              согласования.
            </p>
          )}
        </article>
      ))}
      {eligible && !state.requests.some((r) => r.status !== "closed") && (
        <ReturnRequestForm token={token} />
      )}
    </section>
  );
}
