import {
  parcelProgress,
  type CustomerParcel,
} from "@/lib/delivery/customer-parcels";
export default function ParcelList({
  parcels,
  variant = "default",
}: {
  parcels: CustomerParcel[];
  variant?: "default" | "checkout";
}) {
  return (
    <div className="space-y-3">
      {parcels.length > 1 && (
        <p className="text-stone-600">{parcelProgress(parcels)}</p>
      )}
      {parcels.map((parcel) => (
        <section
          key={parcel.index}
          className={
            variant === "checkout"
              ? "border border-stone-200 p-4 md:p-5 space-y-3"
              : "border border-stone-300/70 p-4 space-y-2"
          }
        >
          <h3
            className={
              variant === "checkout"
                ? "font-body text-copy font-normal text-stone-900"
                : "font-medium"
            }
          >
            Посылка {parcel.index} из {parcel.total}
          </h3>
          <p>{parcel.description}</p>
          <p>{parcel.statusLabel}</p>
          <p className="break-all text-caption text-stone-600">
            Номер отправления:{" "}
            {parcel.number ?? "Появится после оформления отправления"}
          </p>
          {parcel.status === "in_delivery_point" && (
            <p className="text-caption text-stone-600">
              Эту посылку уже можно забрать. Проверьте срок хранения в Ozon.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
