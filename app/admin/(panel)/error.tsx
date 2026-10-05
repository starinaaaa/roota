"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <div className="admin-card space-y-4">
      <h2 className="text-xl">Не удалось загрузить данные</h2>
      <p>Проверьте соединение и настройку админки.</p>
      <button className="admin-button" onClick={reset}>
        Повторить
      </button>
    </div>
  );
}
