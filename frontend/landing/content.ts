// Textos de las páginas de presentación (una por idioma, en /es/, /en/…), para
// buscadores y para quien llega de fuera. Las genera vite.config.ts al compilar
// con template.ts. Solo cuentan lo que el juego tiene de verdad.

import type { Locale } from '../../common/i18n/locales.ts';

/** Dirección pública del juego (si cambia el dominio, se cambia aquí y en index.html, robots.txt y sitemap.xml). */
export const SITE = 'https://skid.gpm-854.workers.dev';

export interface LandingText {
  /** <title> y su descripción para buscadores. */
  readonly title: string;
  readonly description: string;
  readonly h1: string;
  readonly intro: string;
  readonly play: string;
  readonly howLink: string;
  readonly shots: readonly [string, string, string];
  readonly featuresTitle: string;
  readonly features: readonly (readonly [icon: string, title: string, text: string])[];
  readonly howTitle: string;
  readonly steps: readonly [string, string, string];
  readonly faqTitle: string;
  readonly faq: readonly (readonly [question: string, answer: string])[];
  readonly finalTitle: string;
  readonly finalText: string;
  readonly languages: string;
  readonly legal: readonly [privacy: string, terms: string, notice: string];
}

export const LANDING: Record<Locale, LandingText> = {
  es: {
    title: 'Skid · Juego de puzzle sobre hielo gratis: desliza y recoge en orden',
    description:
      'Skid es un juego de puzzle gratis: desliza al pingüino sobre el hielo y recoge los números en orden con los menos movimientos. Reto diario, duelos con amigos y niveles sin fin. Sin registro ni anuncios.',
    h1: 'Skid, el puzzle de deslizamiento sobre hielo',
    intro:
      'Desliza al pingüino por el hielo: no se para hasta chocar con algo. Recoge los números en orden en los menos movimientos posibles. Un reto nuevo cada día, el mismo para todos, y niveles sin fin. Gratis, sin registro y sin anuncios.',
    play: 'Jugar gratis',
    howLink: 'Cómo se juega',
    shots: ['Un tablero de Skid con espejos, puertas y un interruptor', 'La portada de Skid con el reto diario, el semanal y la contrarreloj', 'La pestaña Jugar con el modo libre y los niveles de jugadores'],
    featuresTitle: 'Qué tiene',
    features: [
      ['📅', 'Reto diario', 'Un tablero nuevo cada día, el mismo para todos. Gana quien lo haga en menos movimientos.'],
      ['🧊', 'Niveles sin fin', 'El modo libre genera niveles cada vez más difíciles, con nieve, corrientes, teletransportes, espejos, puertas y bloques.'],
      ['⚔️', 'Duelos en directo', 'Reta a un amigo con un enlace: el mismo tablero nuevo para los dos, a la vez.'],
      ['👥', 'Amigos y ligas', 'Añade amigos, crea ligas y compite cada semana. Con reto semanal y contrarreloj de 3 minutos.'],
      ['🛠️', 'Crea tus niveles', 'Diséñalos con el editor, publícalos y juega, valora y guarda los de otros jugadores.'],
      ['🎩', 'Logros y gorros', 'Cada logro desbloquea un gorro para tu pingüino, y cada mes hay uno de temporada.'],
      ['📴', 'Sin conexión', 'Instálalo como app en el móvil o el ordenador y juega al modo libre aunque no tengas internet.'],
      ['🌍', '7 idiomas', 'Español, inglés, alemán, francés, portugués, italiano y ruso.'],
    ],
    howTitle: 'Cómo se juega',
    steps: [
      'Desliza el dedo (o usa las flechas): el pingüino avanza hasta chocar con un muro.',
      'Recoge los números en orden: 1, 2, 3… Mientras no le toque, un número hace de muro.',
      'Hazlo en los menos movimientos posibles. Volver a empezar es gratis.',
    ],
    faqTitle: 'Preguntas frecuentes',
    faq: [
      ['¿Es gratis?', 'Sí, del todo. Y no tiene anuncios.'],
      ['¿Hace falta registrarse?', 'No. Juegas al momento; si quieres usar tu cuenta en varios dispositivos, puedes entrar con Google.'],
      ['¿Funciona en el móvil y en el ordenador?', 'Sí, en cualquier navegador moderno. Además se puede instalar como app desde el menú del navegador.'],
      ['¿Se puede jugar sin internet?', 'Sí: una vez abierto con conexión, el modo libre y el tutorial funcionan sin red. El reto diario, los duelos y los rankings necesitan conexión.'],
      ['¿Cómo juego con mis amigos?', 'Mándales tu enlace de amigo o crea una liga: veréis vuestros resultados del día y podréis retaros a duelos.'],
    ],
    finalTitle: '¿Te atreves con el reto de hoy?',
    finalText: 'Se aprende en un minuto con el tutorial.',
    languages: 'Idiomas',
    legal: ['Privacidad', 'Términos', 'Aviso legal'],
  },
  en: {
    title: 'Skid · Free ice sliding puzzle game: slide and collect in order',
    description:
      'Skid is a free puzzle game: slide the penguin across the ice and collect the numbers in order in as few moves as you can. Daily challenge, duels with friends and endless levels. No sign-up, no ads.',
    h1: 'Skid, the ice sliding puzzle',
    intro:
      "Slide the penguin across the ice: it doesn't stop until it hits something. Collect the numbers in order in as few moves as you can. A new challenge every day, the same for everyone, and endless levels. Free, no sign-up and no ads.",
    play: 'Play for free',
    howLink: 'How to play',
    shots: ['A Skid board with mirrors, doors and a switch', "Skid's home screen with the daily, weekly and time attack challenges", 'The Play tab with free play and player levels'],
    featuresTitle: 'Features',
    features: [
      ['📅', 'Daily challenge', 'A new board every day, the same for everyone. The fewest moves wins.'],
      ['🧊', 'Endless levels', 'Free play generates ever harder levels, with snow, currents, teleporters, mirrors, doors and blocks.'],
      ['⚔️', 'Live duels', 'Challenge a friend with a link: the same brand-new board for both of you, at the same time.'],
      ['👥', 'Friends and leagues', 'Add friends, create leagues and compete every week. Plus a weekly challenge and a 3-minute time attack.'],
      ['🛠️', 'Make your own levels', "Design them in the editor, publish them, and play, rate and save other players' levels."],
      ['🎩', 'Achievements and hats', 'Every achievement unlocks a hat for your penguin, and there is a seasonal one every month.'],
      ['📴', 'Offline', "Install it as an app on your phone or computer and play free mode even when you're offline."],
      ['🌍', '7 languages', 'Spanish, English, German, French, Portuguese, Italian and Russian.'],
    ],
    howTitle: 'How to play',
    steps: [
      'Swipe (or use the arrow keys): the penguin slides until it hits a wall.',
      "Collect the numbers in order: 1, 2, 3… Until it's its turn, a number acts as a wall.",
      'Do it in as few moves as you can. Restarting is free.',
    ],
    faqTitle: 'FAQ',
    faq: [
      ['Is it free?', 'Yes, completely. And it has no ads.'],
      ['Do I need to sign up?', 'No. You play right away; if you want to use your account on several devices, you can sign in with Google.'],
      ['Does it work on phones and computers?', 'Yes, in any modern browser. You can also install it as an app from the browser menu.'],
      ['Can I play offline?', 'Yes: once opened online, free play and the tutorial work offline. The daily challenge, duels and rankings need a connection.'],
      ['How do I play with friends?', "Send them your friend link or create a league: you'll see each other's daily results and can challenge each other to duels."],
    ],
    finalTitle: "Up for today's challenge?",
    finalText: 'The tutorial teaches you in a minute.',
    languages: 'Languages',
    legal: ['Privacy', 'Terms', 'Legal notice'],
  },
  de: {
    title: 'Skid · Kostenloses Eis-Rutsch-Puzzle: rutschen und der Reihe nach sammeln',
    description:
      'Skid ist ein kostenloses Puzzlespiel: Lass den Pinguin übers Eis rutschen und sammle die Zahlen der Reihe nach mit möglichst wenigen Zügen. Tagesaufgabe, Duelle mit Freunden und endlose Level. Ohne Anmeldung, ohne Werbung.',
    h1: 'Skid, das Rutsch-Puzzle auf dem Eis',
    intro:
      'Lass den Pinguin übers Eis rutschen: Er hält erst an, wenn er gegen etwas stößt. Sammle die Zahlen der Reihe nach mit möglichst wenigen Zügen. Jeden Tag eine neue Aufgabe, für alle gleich, und endlose Level. Kostenlos, ohne Anmeldung und ohne Werbung.',
    play: 'Kostenlos spielen',
    howLink: 'So wird gespielt',
    shots: ['Ein Skid-Brett mit Spiegeln, Türen und einem Schalter', 'Die Startseite von Skid mit Tages-, Wochen- und Zeitrennen-Aufgabe', 'Der Tab „Spielen“ mit freiem Modus und Spieler-Leveln'],
    featuresTitle: 'Was es bietet',
    features: [
      ['📅', 'Tagesaufgabe', 'Jeden Tag ein neues Brett, für alle gleich. Wer die wenigsten Züge braucht, gewinnt.'],
      ['🧊', 'Endlose Level', 'Der freie Modus erzeugt immer schwierigere Level mit Schnee, Strömungen, Teleportern, Spiegeln, Türen und Blöcken.'],
      ['⚔️', 'Live-Duelle', 'Fordere Freunde per Link heraus: dasselbe neue Brett für beide, gleichzeitig.'],
      ['👥', 'Freunde und Ligen', 'Füge Freunde hinzu, gründe Ligen und tritt jede Woche an. Dazu eine Wochenaufgabe und ein 3-Minuten-Zeitrennen.'],
      ['🛠️', 'Eigene Level bauen', 'Entwirf sie im Editor, veröffentliche sie und spiele, bewerte und speichere die anderer.'],
      ['🎩', 'Erfolge und Hüte', 'Jeder Erfolg schaltet einen Hut für deinen Pinguin frei, und jeden Monat gibt es einen Saisonhut.'],
      ['📴', 'Offline', 'Installiere es als App auf Handy oder Computer und spiele den freien Modus auch ohne Internet.'],
      ['🌍', '7 Sprachen', 'Spanisch, Englisch, Deutsch, Französisch, Portugiesisch, Italienisch und Russisch.'],
    ],
    howTitle: 'So wird gespielt',
    steps: [
      'Wische (oder nutze die Pfeiltasten): Der Pinguin rutscht, bis er gegen eine Wand stößt.',
      'Sammle die Zahlen der Reihe nach: 1, 2, 3 … Solange sie nicht dran ist, ist eine Zahl eine Wand.',
      'Schaffe es mit möglichst wenigen Zügen. Neu anfangen ist kostenlos.',
    ],
    faqTitle: 'Häufige Fragen',
    faq: [
      ['Ist es kostenlos?', 'Ja, komplett. Und ohne Werbung.'],
      ['Muss ich mich anmelden?', 'Nein. Du spielst sofort; wenn du dein Konto auf mehreren Geräten nutzen willst, kannst du dich mit Google anmelden.'],
      ['Läuft es auf Handy und Computer?', 'Ja, in jedem modernen Browser. Außerdem lässt es sich über das Browsermenü als App installieren.'],
      ['Kann ich offline spielen?', 'Ja: Einmal online geöffnet, funktionieren freier Modus und Tutorial ohne Netz. Tagesaufgabe, Duelle und Ranglisten brauchen Verbindung.'],
      ['Wie spiele ich mit Freunden?', 'Schick ihnen deinen Freundeslink oder gründe eine Liga: Ihr seht eure Tagesergebnisse und könnt euch zu Duellen herausfordern.'],
    ],
    finalTitle: 'Traust du dich an die heutige Aufgabe?',
    finalText: 'Das Tutorial bringt es dir in einer Minute bei.',
    languages: 'Sprachen',
    legal: ['Datenschutz', 'Bedingungen', 'Impressum'],
  },
  fr: {
    title: 'Skid · Jeu de puzzle sur glace gratuit : glisse et ramasse dans l’ordre',
    description:
      'Skid est un jeu de puzzle gratuit : fais glisser le pingouin sur la glace et ramasse les nombres dans l’ordre en un minimum de coups. Défi du jour, duels entre amis et niveaux sans fin. Sans inscription ni publicité.',
    h1: 'Skid, le puzzle de glisse sur la glace',
    intro:
      'Fais glisser le pingouin sur la glace : il ne s’arrête qu’en heurtant quelque chose. Ramasse les nombres dans l’ordre en un minimum de coups. Un nouveau défi chaque jour, le même pour tous, et des niveaux sans fin. Gratuit, sans inscription et sans publicité.',
    play: 'Jouer gratuitement',
    howLink: 'Comment jouer',
    shots: ['Un plateau de Skid avec des miroirs, des portes et un interrupteur', 'L’accueil de Skid avec le défi du jour, de la semaine et le contre-la-montre', 'L’onglet Jouer avec le mode libre et les niveaux des joueurs'],
    featuresTitle: 'Ce qu’il propose',
    features: [
      ['📅', 'Défi du jour', 'Un nouveau plateau chaque jour, le même pour tous. Celui qui fait le moins de coups gagne.'],
      ['🧊', 'Niveaux sans fin', 'Le mode libre génère des niveaux toujours plus durs, avec neige, courants, téléporteurs, miroirs, portes et blocs.'],
      ['⚔️', 'Duels en direct', 'Défie un ami avec un lien : le même plateau inédit pour vous deux, en même temps.'],
      ['👥', 'Amis et ligues', 'Ajoute des amis, crée des ligues et affrontez-vous chaque semaine. Avec un défi de la semaine et un contre-la-montre de 3 minutes.'],
      ['🛠️', 'Crée tes niveaux', 'Conçois-les dans l’éditeur, publie-les, et joue, note et enregistre ceux des autres joueurs.'],
      ['🎩', 'Succès et chapeaux', 'Chaque succès débloque un chapeau pour ton pingouin, et chaque mois il y en a un de saison.'],
      ['📴', 'Hors ligne', 'Installe-le comme une appli sur ton téléphone ou ton ordinateur et joue au mode libre même sans internet.'],
      ['🌍', '7 langues', 'Espagnol, anglais, allemand, français, portugais, italien et russe.'],
    ],
    howTitle: 'Comment jouer',
    steps: [
      'Glisse le doigt (ou utilise les flèches) : le pingouin avance jusqu’à heurter un mur.',
      'Ramasse les nombres dans l’ordre : 1, 2, 3… Tant que ce n’est pas son tour, un nombre fait office de mur.',
      'Fais-le en un minimum de coups. Recommencer est gratuit.',
    ],
    faqTitle: 'Questions fréquentes',
    faq: [
      ['C’est gratuit ?', 'Oui, entièrement. Et sans publicité.'],
      ['Faut-il s’inscrire ?', 'Non. Tu joues tout de suite ; pour utiliser ton compte sur plusieurs appareils, tu peux te connecter avec Google.'],
      ['Ça marche sur téléphone et ordinateur ?', 'Oui, dans n’importe quel navigateur récent. Tu peux aussi l’installer comme une appli depuis le menu du navigateur.'],
      ['Peut-on jouer hors ligne ?', 'Oui : une fois ouvert avec une connexion, le mode libre et le tutoriel marchent sans réseau. Le défi du jour, les duels et les classements ont besoin de connexion.'],
      ['Comment jouer avec mes amis ?', 'Envoie-leur ton lien d’ami ou crée une ligue : vous verrez vos résultats du jour et pourrez vous défier en duel.'],
    ],
    finalTitle: 'Tu relèves le défi du jour ?',
    finalText: 'Le tutoriel t’apprend à jouer en une minute.',
    languages: 'Langues',
    legal: ['Confidentialité', 'Conditions', 'Mentions légales'],
  },
  pt: {
    title: 'Skid · Jogo de puzzle no gelo grátis: desliza e apanha por ordem',
    description:
      'Skid é um jogo de puzzle grátis: faz o pinguim deslizar no gelo e apanha os números por ordem com o menor número de movimentos. Desafio diário, duelos com amigos e níveis sem fim. Sem registo nem anúncios.',
    h1: 'Skid, o puzzle de deslizar no gelo',
    intro:
      'Faz o pinguim deslizar no gelo: só para quando bate em algo. Apanha os números por ordem com o menor número de movimentos. Um desafio novo todos os dias, igual para todos, e níveis sem fim. Grátis, sem registo e sem anúncios.',
    play: 'Jogar grátis',
    howLink: 'Como se joga',
    shots: ['Um tabuleiro de Skid com espelhos, portas e um interruptor', 'O início de Skid com o desafio diário, o semanal e o contrarrelógio', 'O separador Jogar com o modo livre e os níveis dos jogadores'],
    featuresTitle: 'O que tem',
    features: [
      ['📅', 'Desafio diário', 'Um tabuleiro novo todos os dias, igual para todos. Ganha quem fizer menos movimentos.'],
      ['🧊', 'Níveis sem fim', 'O modo livre gera níveis cada vez mais difíceis, com neve, correntes, teletransportes, espelhos, portas e blocos.'],
      ['⚔️', 'Duelos em direto', 'Desafia um amigo com uma ligação: o mesmo tabuleiro novo para os dois, ao mesmo tempo.'],
      ['👥', 'Amigos e ligas', 'Adiciona amigos, cria ligas e compete todas as semanas. Com desafio semanal e contrarrelógio de 3 minutos.'],
      ['🛠️', 'Cria os teus níveis', 'Desenha-os no editor, publica-os e joga, avalia e guarda os dos outros jogadores.'],
      ['🎩', 'Conquistas e chapéus', 'Cada conquista desbloqueia um chapéu para o teu pinguim, e todos os meses há um de temporada.'],
      ['📴', 'Sem ligação', 'Instala-o como app no telemóvel ou no computador e joga o modo livre mesmo sem internet.'],
      ['🌍', '7 idiomas', 'Espanhol, inglês, alemão, francês, português, italiano e russo.'],
    ],
    howTitle: 'Como se joga',
    steps: [
      'Desliza o dedo (ou usa as setas): o pinguim avança até bater numa parede.',
      'Apanha os números por ordem: 1, 2, 3… Enquanto não for a vez dele, um número é uma parede.',
      'Fá-lo com o menor número de movimentos. Recomeçar é grátis.',
    ],
    faqTitle: 'Perguntas frequentes',
    faq: [
      ['É grátis?', 'Sim, totalmente. E não tem anúncios.'],
      ['É preciso registar-me?', 'Não. Jogas logo; se quiseres usar a tua conta em vários dispositivos, podes entrar com o Google.'],
      ['Funciona no telemóvel e no computador?', 'Sim, em qualquer navegador moderno. Também se pode instalar como app a partir do menu do navegador.'],
      ['Dá para jogar sem internet?', 'Sim: depois de aberto com ligação, o modo livre e o tutorial funcionam sem rede. O desafio diário, os duelos e os rankings precisam de ligação.'],
      ['Como jogo com os meus amigos?', 'Envia-lhes a tua ligação de amigo ou cria uma liga: vão ver os resultados do dia uns dos outros e podem desafiar-se para duelos.'],
    ],
    finalTitle: 'Aceitas o desafio de hoje?',
    finalText: 'O tutorial ensina-te a jogar num minuto.',
    languages: 'Idiomas',
    legal: ['Privacidade', 'Termos', 'Aviso legal'],
  },
  it: {
    title: 'Skid · Gioco puzzle sul ghiaccio gratis: scivola e raccogli in ordine',
    description:
      'Skid è un gioco puzzle gratuito: fai scivolare il pinguino sul ghiaccio e raccogli i numeri in ordine con meno mosse possibile. Sfida del giorno, duelli con gli amici e livelli infiniti. Senza registrazione né pubblicità.',
    h1: 'Skid, il puzzle di scivolate sul ghiaccio',
    intro:
      'Fai scivolare il pinguino sul ghiaccio: si ferma solo quando sbatte contro qualcosa. Raccogli i numeri in ordine con meno mosse possibile. Una sfida nuova ogni giorno, uguale per tutti, e livelli infiniti. Gratis, senza registrazione e senza pubblicità.',
    play: 'Gioca gratis',
    howLink: 'Come si gioca',
    shots: ['Una tavola di Skid con specchi, porte e un interruttore', 'La home di Skid con la sfida del giorno, quella settimanale e la cronometro', 'La scheda Gioca con la modalità libera e i livelli dei giocatori'],
    featuresTitle: 'Cosa offre',
    features: [
      ['📅', 'Sfida del giorno', 'Una tavola nuova ogni giorno, uguale per tutti. Vince chi usa meno mosse.'],
      ['🧊', 'Livelli infiniti', 'La modalità libera genera livelli sempre più difficili, con neve, correnti, teletrasporti, specchi, porte e blocchi.'],
      ['⚔️', 'Duelli dal vivo', 'Sfida un amico con un link: la stessa tavola nuova per entrambi, nello stesso momento.'],
      ['👥', 'Amici e leghe', 'Aggiungi amici, crea leghe e sfidatevi ogni settimana. Con sfida settimanale e cronometro da 3 minuti.'],
      ['🛠️', 'Crea i tuoi livelli', 'Disegnali nell’editor, pubblicali e gioca, vota e salva quelli degli altri giocatori.'],
      ['🎩', 'Obiettivi e cappelli', 'Ogni obiettivo sblocca un cappello per il tuo pinguino, e ogni mese ce n’è uno stagionale.'],
      ['📴', 'Offline', 'Installalo come app sul telefono o sul computer e gioca alla modalità libera anche senza internet.'],
      ['🌍', '7 lingue', 'Spagnolo, inglese, tedesco, francese, portoghese, italiano e russo.'],
    ],
    howTitle: 'Come si gioca',
    steps: [
      'Scorri con il dito (o usa le frecce): il pinguino avanza finché non sbatte contro un muro.',
      'Raccogli i numeri in ordine: 1, 2, 3… Finché non è il suo turno, un numero fa da muro.',
      'Fallo con meno mosse possibile. Ricominciare è gratis.',
    ],
    faqTitle: 'Domande frequenti',
    faq: [
      ['È gratis?', 'Sì, del tutto. E senza pubblicità.'],
      ['Serve registrarsi?', 'No. Giochi subito; se vuoi usare il tuo account su più dispositivi, puoi accedere con Google.'],
      ['Funziona su telefono e computer?', 'Sì, in qualsiasi browser moderno. Puoi anche installarlo come app dal menu del browser.'],
      ['Si può giocare offline?', 'Sì: una volta aperto con la connessione, la modalità libera e il tutorial funzionano senza rete. La sfida del giorno, i duelli e le classifiche richiedono la connessione.'],
      ['Come gioco con i miei amici?', 'Mandagli il tuo link amico o crea una lega: vedrete i risultati del giorno e potrete sfidarvi a duello.'],
    ],
    finalTitle: 'Accetti la sfida di oggi?',
    finalText: 'Il tutorial ti insegna a giocare in un minuto.',
    languages: 'Lingue',
    legal: ['Privacy', 'Termini', 'Note legali'],
  },
  ru: {
    title: 'Skid · Бесплатная головоломка на льду: скользи и собирай по порядку',
    description:
      'Skid — бесплатная головоломка: веди пингвина по льду и собирай числа по порядку за как можно меньшее число ходов. Ежедневное испытание, дуэли с друзьями и бесконечные уровни. Без регистрации и рекламы.',
    h1: 'Skid — головоломка со скольжением по льду',
    intro:
      'Веди пингвина по льду: он не остановится, пока во что-нибудь не упрётся. Собирай числа по порядку за как можно меньшее число ходов. Каждый день новое испытание, одно на всех, и бесконечные уровни. Бесплатно, без регистрации и без рекламы.',
    play: 'Играть бесплатно',
    howLink: 'Как играть',
    shots: ['Поле Skid с зеркалами, дверями и переключателем', 'Главный экран Skid с ежедневным, недельным испытанием и заездом на время', 'Вкладка «Играть» со свободным режимом и уровнями игроков'],
    featuresTitle: 'Что есть в игре',
    features: [
      ['📅', 'Ежедневное испытание', 'Каждый день новое поле, одно на всех. Побеждает тот, кто сделает меньше ходов.'],
      ['🧊', 'Бесконечные уровни', 'Свободный режим создаёт всё более сложные уровни: снег, течения, телепорты, зеркала, двери и блоки.'],
      ['⚔️', 'Дуэли в реальном времени', 'Вызови друга по ссылке: одно и то же новое поле для обоих, одновременно.'],
      ['👥', 'Друзья и лиги', 'Добавляй друзей, создавай лиги и соревнуйтесь каждую неделю. Плюс недельное испытание и 3-минутный заезд на время.'],
      ['🛠️', 'Свои уровни', 'Создавай их в редакторе, публикуй, играй, оценивай и сохраняй уровни других игроков.'],
      ['🎩', 'Достижения и шапки', 'Каждое достижение открывает шапку для пингвина, а каждый месяц есть сезонная.'],
      ['📴', 'Без интернета', 'Установи как приложение на телефон или компьютер и играй в свободный режим даже без сети.'],
      ['🌍', '7 языков', 'Испанский, английский, немецкий, французский, португальский, итальянский и русский.'],
    ],
    howTitle: 'Как играть',
    steps: [
      'Проведи пальцем (или нажми стрелку): пингвин скользит, пока не упрётся в стену.',
      'Собирай числа по порядку: 1, 2, 3… Пока не его очередь, число работает как стена.',
      'Сделай это за как можно меньшее число ходов. Начать заново — бесплатно.',
    ],
    faqTitle: 'Частые вопросы',
    faq: [
      ['Это бесплатно?', 'Да, полностью. И без рекламы.'],
      ['Нужно регистрироваться?', 'Нет. Играешь сразу; чтобы использовать аккаунт на нескольких устройствах, можно войти через Google.'],
      ['Работает на телефоне и компьютере?', 'Да, в любом современном браузере. Ещё её можно установить как приложение через меню браузера.'],
      ['Можно играть без интернета?', 'Да: после первого открытия с сетью свободный режим и обучение работают офлайн. Ежедневное испытание, дуэли и рейтинги требуют соединения.'],
      ['Как играть с друзьями?', 'Отправь им свою ссылку для друзей или создай лигу: вы увидите результаты друг друга за день и сможете вызывать друг друга на дуэли.'],
    ],
    finalTitle: 'Возьмёшься за сегодняшнее испытание?',
    finalText: 'Обучение займёт всего минуту.',
    languages: 'Языки',
    legal: ['Конфиденциальность', 'Условия', 'Правовая информация'],
  },
};
