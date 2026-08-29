"use client";

type NativeServerWindow = Window & {
  webkit?: { messageHandlers?: { serverSettings?: { postMessage: (payload: object) => void } } };
};

export function openNativeServerSettings(source: string) {
  const handler = (window as NativeServerWindow).webkit?.messageHandlers?.serverSettings;
  if (handler) {
    handler.postMessage({ source });
    return;
  }
  window.alert("Le impostazioni del server sono disponibili nell’app installata sull’iPad.");
}

export function NativeServerSettingsCard() {
  return (
    <section className="rounded-2xl border border-teal-200 bg-gradient-to-br from-teal-50 via-white to-amber-50 p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-teal-700">App iPad</p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Server di connessione</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Controlla l’indirizzo configurato sull’iPad oppure collegati a un altro server.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNativeServerSettings("system-page")}
          className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 active:scale-[.98]"
        >
          Controlla o modifica server
        </button>
      </div>
    </section>
  );
}
