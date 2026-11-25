const API = "/produtos";
const $ = (id) => document.getElementById(id);

const vitrine = $("vitrine");
const campoBusca = $("busca");
const seletorCategoria = $("categoria");
const soDisponiveis = $("soDisponiveis");
const arquivoFoto = $("arquivoFoto");
const dialogoFoto = $("dialogoFoto");

const SITUACAO = {
    ok: { texto: "Em estoque", icone: "✓" },
    baixo: { texto: "Poucas unidades", icone: "▲" },
    sem_estoque: { texto: "Esgotado", icone: "✕" },
};
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// cores das ilustrações (usadas quando o produto ainda não tem foto)
const PALETAS = [
    { chave: /amarg|cacau/i, cor: "#4a2a1d", brilho: "#7a4a36" },
    { chave: /branco/i, cor: "#e6cf9d", brilho: "#f8ecd2" },
    { chave: /leite/i, cor: "#a8643a", brilho: "#cf8a55" },
    { chave: /trufa|bombom/i, cor: "#6b3829", brilho: "#97583f" },
    { chave: /framboesa|morango|fruta/i, cor: "#b3264f", brilho: "#dd5a80" },
    { chave: /caramelo|doce/i, cor: "#c88a3a", brilho: "#eab45f" },
];

let produtos = [];
let idParaFoto = null;

/* ---------- Utilitários ---------- */
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[c]);
}
function normalizar(texto) {
    return String(texto).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}
function formatarData(iso) {
    if (!iso) return null;
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
}
function avisar(texto, tipo = "sucesso") {
    const aviso = document.createElement("div");
    aviso.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
    aviso.textContent = texto;
    $("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 6000 : 3500);
}
async function chamarAPI(url, opcoes) {
    let resposta;
    try {
        resposta = await fetch(url, opcoes);
    } catch {
        throw new Error("Não foi possível conectar ao servidor. Confira se o Flask está rodando.");
    }
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Algo deu errado. Tente de novo.");
    return dados;
}

/* ---------- Imagem do produto: foto ou ilustração ---------- */
function paleta(p) {
    const texto = `${p.nome} ${p.categoria}`;
    const achada = PALETAS.find((x) => x.chave.test(texto));
    if (achada) return achada;
    let soma = 0;
    for (const letra of p.categoria) soma += letra.charCodeAt(0);
    return PALETAS[soma % PALETAS.length];
}

function ilustracao(p) {
    const { cor, brilho } = paleta(p);
    let quadrados = "";
    for (let linha = 0; linha < 4; linha++) {
        for (let coluna = 0; coluna < 3; coluna++) {
            const x = 62 + coluna * 38;
            const y = 20 + linha * 34;
            quadrados += `<rect x="${x}" y="${y}" width="34" height="30" rx="5" fill="${cor}"/>
                <rect x="${x + 3}" y="${y + 3}" width="28" height="24" rx="3" fill="${brilho}" opacity=".5"/>
                <path d="M${x + 6} ${y + 9}h9" stroke="#fff" stroke-opacity=".4" stroke-width="2" stroke-linecap="round"/>`;
        }
    }
    return `<svg viewBox="0 0 240 180" role="img" aria-label="Ilustração de ${escaparHTML(p.nome)}" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="120" cy="164" rx="70" ry="8" fill="#2b1810" opacity=".18"/>
        ${quadrados}
        <polygon points="56,112 176,98 176,158 56,158" fill="#d9a441"/>
        <polygon points="56,112 176,98 176,106 56,120" fill="#f2cf7a"/>
        <rect x="56" y="132" width="120" height="14" fill="#b3264f"/>
        <path d="M70 139h40" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>
    </svg>`;
}

function imagemProduto(p, tamanho = "pequena") {
    if (p.tem_foto) {
        const url = `${API}/${p.id_produto}/foto?v=${p.foto_versao}`;
        return `<img src="${url}" alt="Foto de ${escaparHTML(p.nome)}" loading="lazy" decoding="async" class="${tamanho}">`;
    }
    return ilustracao(p);
}

/* ---------- Vitrine ---------- */
function filtrados() {
    const termo = normalizar(campoBusca.value.trim());
    const categoria = seletorCategoria.value;
    return produtos
        .filter((p) => !categoria || p.categoria === categoria)
        .filter((p) => !soDisponiveis.checked || p.situacao !== "sem_estoque")
        .filter((p) => !termo || [p.nome, p.fornecedor, p.categoria].some((v) => normalizar(v).includes(termo)))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

function atualizarCategorias() {
    const atual = seletorCategoria.value;
    const categorias = [...new Set(produtos.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    seletorCategoria.innerHTML = '<option value="">Todas as categorias</option>' +
        categorias.map((c) => `<option value="${escaparHTML(c)}">${escaparHTML(c)}</option>`).join("");
    seletorCategoria.value = categorias.includes(atual) ? atual : "";
}

function cartao(p) {
    const s = SITUACAO[p.situacao];
    const nome = escaparHTML(p.nome);
    const validade = formatarData(p.validade);
    const quantidade = p.quantidade_estoque === 0
        ? "Sem unidades no momento"
        : plural(p.quantidade_estoque, "unidade", "unidades");
    return `
    <article class="cartao ${p.situacao === "sem_estoque" ? "indisponivel" : ""}" data-id="${p.id_produto}">
        <button type="button" class="foto" data-acao="ampliar" aria-label="Ampliar a imagem de ${nome}">
            ${imagemProduto(p)}
            <span class="selo ${p.situacao}"><span aria-hidden="true">${s.icone}</span>${s.texto}</span>
        </button>
        <div class="cartao-corpo">
            <p class="cartao-cat">${escaparHTML(p.categoria)} · ${escaparHTML(p.fornecedor)}</p>
            <h2>${nome}</h2>
            <p class="preco">${moeda.format(p.preco)}</p>
            <p class="detalhe">${quantidade}${validade ? ` · vence em ${validade}` : ""}</p>
            <div class="cartao-acoes">
                <button type="button" class="secundario pequeno" data-acao="foto" aria-label="${p.tem_foto ? "Trocar" : "Adicionar"} foto de ${nome}">${p.tem_foto ? "Trocar foto" : "Adicionar foto"}</button>
                ${p.tem_foto ? `<button type="button" class="link-perigo" data-acao="remover-foto" aria-label="Remover foto de ${nome}">Remover</button>` : ""}
            </div>
        </div>
    </article>`;
}

function renderizar() {
    atualizarCategorias();
    const lista = filtrados();
    const semFoto = produtos.filter((p) => !p.tem_foto).length;

    $("subtituloVitrine").textContent = produtos.length === 0
        ? "Nenhum produto cadastrado ainda."
        : `${plural(produtos.length, "produto", "produtos")} na vitrine` +
          (semFoto ? `. ${plural(semFoto, "ainda está", "ainda estão")} com ilustração: use “Adicionar foto” para enviar a foto real.` : ". Todos com foto.");
    $("contador").textContent = produtos.length ? `Mostrando ${lista.length} de ${produtos.length}.` : "";

    if (produtos.length === 0) {
        vitrine.innerHTML = `<div class="vazio vazio-vitrine"><strong>A vitrine está vazia</strong>
            Cadastre produtos na página de estoque para eles aparecerem aqui.<br>
            <a class="botao-link" href="/">Ir para o estoque</a></div>`;
        return;
    }
    if (lista.length === 0) {
        vitrine.innerHTML = `<div class="vazio vazio-vitrine"><strong>Nenhum produto encontrado</strong>
            Tente outro termo ou limpe os filtros.<br>
            <button type="button" class="secundario" data-limpar>Limpar filtros</button></div>`;
        return;
    }
    vitrine.innerHTML = lista.map(cartao).join("");
}

async function carregar() {
    try {
        produtos = await chamarAPI(API);
        renderizar();
    } catch (erro) {
        $("subtituloVitrine").textContent = erro.message;
        vitrine.innerHTML = `<div class="vazio vazio-vitrine"><strong>Falha ao carregar</strong>${escaparHTML(erro.message)}<br>
            <button type="button" class="secundario" data-recarregar>Tentar de novo</button></div>`;
    }
}

/* ---------- Envio de foto ---------- */
async function reduzirImagem(arquivo, lado = 1000) {
    // diminui a foto no navegador (mais rápido e economiza espaço); se falhar, envia a original
    try {
        const imagem = await createImageBitmap(arquivo);
        const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(imagem.width * escala);
        canvas.height = Math.round(imagem.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
        return await new Promise((ok) => canvas.toBlob((b) => ok(b || arquivo), "image/jpeg", 0.86));
    } catch {
        return arquivo;
    }
}

function substituirProduto(atualizado) {
    produtos = produtos.map((p) => (p.id_produto === atualizado.id_produto ? atualizado : p));
    renderizar();
}

arquivoFoto.addEventListener("change", async () => {
    const arquivo = arquivoFoto.files[0];
    const id = idParaFoto;
    arquivoFoto.value = "";
    if (!arquivo || id === null) return;

    try {
        const imagem = await reduzirImagem(arquivo);
        const dados = new FormData();
        dados.append("foto", imagem, "foto.jpg");
        const resultado = await chamarAPI(`${API}/${id}/foto`, { method: "POST", body: dados });
        substituirProduto(resultado.produto);
        avisar(resultado.mensagem);
    } catch (erro) {
        avisar(erro.message, "erro");
    }
});

async function removerFoto(id) {
    try {
        const resultado = await chamarAPI(`${API}/${id}/foto`, { method: "DELETE" });
        substituirProduto(resultado.produto);
        avisar(resultado.mensagem);
    } catch (erro) {
        avisar(erro.message, "erro");
    }
}

/* ---------- Foto ampliada ---------- */
function ampliar(p) {
    $("tituloFoto").textContent = p.nome;
    $("conteudoFoto").innerHTML = imagemProduto(p, "grande");
    $("legendaFoto").textContent = `${moeda.format(p.preco)} · ${p.categoria} · ${p.fornecedor}`;
    dialogoFoto.showModal();
}
$("fecharFoto").addEventListener("click", () => dialogoFoto.close());
dialogoFoto.addEventListener("click", (e) => { if (e.target === dialogoFoto) dialogoFoto.close(); });

/* ---------- Eventos ---------- */
function limparFiltros() {
    campoBusca.value = "";
    seletorCategoria.value = "";
    soDisponiveis.checked = false;
    renderizar();
}

campoBusca.addEventListener("input", renderizar);
seletorCategoria.addEventListener("change", renderizar);
soDisponiveis.addEventListener("change", renderizar);

vitrine.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-limpar")) return limparFiltros();
    if (alvo.hasAttribute("data-recarregar")) return carregar();

    const cartaoEl = alvo.closest(".cartao");
    if (!cartaoEl) return;
    const id = Number(cartaoEl.dataset.id);
    const produto = produtos.find((p) => p.id_produto === id);

    if (alvo.dataset.acao === "ampliar") ampliar(produto);
    else if (alvo.dataset.acao === "foto") { idParaFoto = id; arquivoFoto.click(); }
    else if (alvo.dataset.acao === "remover-foto") removerFoto(id);
});

carregar();