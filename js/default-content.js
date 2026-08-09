export const MEDIA_API = "https://capannone-itabirito-api.wagnermelillo.workers.dev";

export const CATEGORY_LABELS = Object.freeze({
  pizzas: "Pizzas",
  cervejas: "Cervejas",
  refrigerantes: "Refrigerantes",
  sucos: "Sucos",
  promocoes: "Promoções"
});

export const DEFAULT_SITE_CONTENT = Object.freeze({
  announcement: "Aberto todos os dias · 18h às 23h",
  heroTitle: "A noite fica",
  heroHighlight: "melhor",
  heroSuffix: "com pizza de verdade.",
  heroText: "Massa fininha, ingredientes caprichados e aquele clima gostoso para reunir quem você gosta.",
  heroImageUrl: "assets/img/p1_img2.jpg",
  heroImageMediaId: "",
  historyTitle: "Uma mesa pronta para receber você.",
  historyText: "Na Capannone, cada pizza é feita para transformar uma noite comum num encontro que dá vontade de repetir. Nossa massa fininha recebe ingredientes de qualidade e sai quentinha, no ponto para compartilhar.\n\nÉ pizza italiana com o tempero acolhedor de Itabirito: um salão de portas abertas, bons sabores e espaço para celebrar.",
  historyImageUrl: "assets/img/uma-noite-de-pizza.jpg",
  historyImageMediaId: "",
  eventsTitle: "Seu momento especial merece uma mesa memorável.",
  eventsText: "O Espaço Capannone é uma opção acolhedora para aniversários, encontros de família, confraternizações e pequenas celebrações.",
  eventsImageUrl: "assets/img/p1_img2.jpg",
  eventsImageMediaId: "",
  openingHours: "Todos os dias · 18h às 23h",
  address: "Rua Turmalina, 153\nSanta Tereza · Itabirito-MG\nCEP 35454-084",
  phone: "+553135631105",
  whatsapp: "5531983284984",
  eventsWhatsapp: "5531989360951",
  aiqfomeUrl: "https://aiqfome.com/MG/itabirito/capannone",
  instagramUrl: "https://www.instagram.com/capannoneitabirito/",
  facebookUrl: "https://www.facebook.com/CapannoneItabirito"
});

const PIZZA_SOURCE = [
  ["Alemã", "molho de tomate, muçarela, azeitona, catupiry, lombo canadense, calabresa, bacon e orégano", 67],
  ["Pepperoni", "molho de tomate, muçarela, azeitona, catupiry, pepperoni e orégano", 77],
  ["Calabresa com catupiry", "molho de tomate, muçarela, calabresa, catupiry e orégano", 67],
  ["Calabresa baiana", "molho de tomate, calabresa ralada, catupiry, lemon pepper e orégano", 67],
  ["Lombo canadense", "molho de tomate, muçarela, lombo canadense, azeitona, catupiry e orégano", 67],
  ["Portuguesa", "molho de tomate, muçarela, calabresa, presunto, ovos, catupiry, azeitonas pretas e orégano", 67],
  ["Palmito à bolonhesa", "molho à bolonhesa, muçarela, palmito, catupiry, azeitonas e orégano", 67],
  ["Frango com palmito", "molho de tomate, muçarela, milho, azeitona, catupiry, peito de frango, palmito e orégano", 67],
  ["Presunto com catupiry", "molho de tomate, muçarela, presunto, catupiry, azeitonas e orégano", 67],
  ["À moda da casa", "molho de tomate, muçarela, peito de frango, calabresa, bacon, milho, catupiry, azeitonas e orégano", 67],
  ["Bolonhesa", "molho à bolonhesa, muçarela, champignon na manteiga, catupiry, azeitonas e orégano", 67],
  ["Siciliana", "molho de tomate, muçarela, champignon na manteiga, catupiry, bacon, calabresa, azeitonas e orégano", 67],
  ["Bação", "molho de tomate, cupim ao molho de cerveja preta, muçarela, catupiry, azeitonas e orégano", 77],
  ["Carne seca", "molho de tomate, muçarela, azeitona, catupiry, carne seca e orégano", 77],
  ["Mineirinha", "molho de tomate, muçarela, azeitona, catupiry, linguiça suína ao molho de mel com mostarda, pimenta calabresa, alho frito e orégano", 77],
  ["Abobrinha", "molho de tomate, fatias de abobrinha, muçarela, queijo polenguinho, bacon e orégano", 67],
  ["Brócolis com bacon", "molho de tomate, muçarela, catupiry, brócolis, bacon e alho frito", 67],
  ["Milho e bacon", "molho de tomate, muçarela, azeitona, catupiry, milho, bacon e orégano", 67],
  ["Atum com catupiry", "molho de tomate, muçarela, atum, catupiry, azeitonas e orégano", 67],
  ["Vegetariana", "molho de tomate, muçarela, palmito, milho, catupiry, champignon na manteiga, azeitonas e orégano", 67],
  ["Marguerita", "molho de tomate, muçarela, tomate cereja e manjericão", 67],
  ["Quatro queijos", "molho de tomate, muçarela, provolone, cheddar, catupiry e orégano", 67],
  ["Palmito com catupiry", "molho de tomate, muçarela, palmito, milho, catupiry, azeitonas e orégano", 67],
  ["Alho-poró", "molho de tomate, muçarela, requeijão catupiry, alho-poró, bacon, creme de leite, alho granulado e orégano", 77],
  ["Frango com catupiry", "molho de tomate, muçarela, peito de frango, milho, catupiry, azeitonas e orégano", 67],
  ["Alho e óleo", "molho de tomate, muçarela, azeite, alho frito e orégano", 67],
  ["Abacaxi com bacon", "molho de tomate, muçarela, azeitona, catupiry, abacaxi caramelizado, bacon e orégano", 77],
  ["Presunto parma", "molho de tomate, muçarela, azeitona, catupiry, presunto parma e orégano", 77],
  ["Charmozinha", "massa, molho de tomate especial, muçarela, carne suína desfiada, requeijão cremoso, cebola roxa e molho barbecue", 67]
];

const slug = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const price = (label, value) => ({ label, value });

const pizzas = PIZZA_SOURCE.map(([name, description, base], index) => ({
  id: `pizza-${slug(name)}`,
  name,
  description,
  category: "pizzas",
  prices: [price("Média · 30cm", base), price("Grande · 35cm", base + 12), price("Gigante · 40cm", base + 24)],
  active: true,
  sortOrder: index + 1,
  imageUrl: "",
  imageMediaId: "",
  videoUrl: "",
  videoMediaId: "",
  orderMessage: `Olá! Quero pedir a pizza ${name} na Capannone.`
}));

const drinks = [
  ["cervejas", "Heineken Zero · long neck", 12],
  ["cervejas", "Heineken · 600ml", 18],
  ["cervejas", "Heineken · long neck", 12],
  ["cervejas", "Original · 600ml", 16],
  ["cervejas", "Stella Artois · 600ml", 17],
  ["cervejas", "Stella Artois · long neck", 12],
  ["cervejas", "Spaten · 600ml", 16],
  ["refrigerantes", "Coca-Cola · lata 350ml", 6.5],
  ["refrigerantes", "Coca-Cola · 2 litros", 18],
  ["refrigerantes", "Guaraná · lata 350ml", 6.5],
  ["refrigerantes", "Guaraná · 1 litro", 11],
  ["refrigerantes", "Guaraná · 2 litros", 16],
  ["sucos", "Suco de pêssego · 1 litro", 14],
  ["sucos", "Suco de pêssego · lata 290ml", 6.5],
  ["sucos", "Suco de uva · 1 litro", 14],
  ["sucos", "Suco de uva · lata 290ml", 6.5]
].map(([category, name, value], index) => ({
  id: `${category}-${slug(name)}`,
  name,
  description: "",
  category,
  prices: [price("Unidade", value)],
  active: true,
  sortOrder: index + 1,
  imageUrl: "",
  imageMediaId: "",
  videoUrl: "",
  videoMediaId: "",
  orderMessage: `Olá! Quero incluir ${name} no meu pedido da Capannone.`
}));

const promotion = {
  id: "promocao-a-moda-da-casa",
  name: "À moda da casa",
  description: "Molho de tomate, muçarela, peito de frango, calabresa, bacon, milho, catupiry, azeitonas e orégano.",
  category: "promocoes",
  prices: [price("Média · 30cm", 67), price("Grande · 35cm", 79), price("Gigante · 40cm", 91)],
  active: true,
  sortOrder: 1,
  imageUrl: "",
  imageMediaId: "",
  videoUrl: "",
  videoMediaId: "",
  orderMessage: "Olá! Quero pedir a pizza à moda da casa na Capannone."
};

export const DEFAULT_MENU_ITEMS = Object.freeze([...pizzas, ...drinks, promotion]);
