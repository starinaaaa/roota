"use client";
export default function PrintConfirmation() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-stone-900 text-white px-6 py-3 font-body text-ui"
    >
      Сохранить в PDF или распечатать
    </button>
  );
}
