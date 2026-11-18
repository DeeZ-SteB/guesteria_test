// Stage 3 replaces this with the search form and results.
export default function Home() {
  return (
    <section className="bg-primary text-on-primary">
      <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-10 md:px-8 md:py-20">
        <p className="text-sm font-medium uppercase tracking-wide opacity-80">Guesteria Stay</p>
        <h1 className="mt-2 max-w-xl text-headline font-bold md:text-display">Куди їдемо?</h1>
        <p className="mt-3 max-w-md opacity-90">Готелі з AI-асистентом для вашої поїздки. Пошук зʼявиться на наступному етапі.</p>
      </div>
    </section>
  );
}
