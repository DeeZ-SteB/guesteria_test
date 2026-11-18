export function CheckoutChecking() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center" role="status">
      <div className="size-14 animate-spin rounded-full border-4 border-primary-soft border-t-primary" aria-hidden />
      <h1 className="mt-6 text-lg font-bold">Перевіряємо наявність і ціну…</h1>
      <p className="mt-2 text-sm text-muted">Це може зайняти кілька секунд. Не закривайте сторінку.</p>
    </div>
  );
}
