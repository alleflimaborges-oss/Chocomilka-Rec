const API = "/produtos";

/* ---------- Elementos ---------- */
const $ = (id) => document.getElementById(id);
const tabela = $("listaProdutos");
const campoBusca = $("busca");
const seletorOrdem = $("ordem");
const contador = $("contador");
const resumo = document.querySelector(".resumo");
const tituloResumo = $("titulo-resumo");
const subtituloResumo = $("subtitulo-resumo");
const chips = document.querySelectorAll(".chip");

const dialogoProduto = $("dialogoProduto");
const formulario = $("formProduto");
const campoId = $("produtoId");
const botaoSalvar = $("botaoSalvar");
const erroGeral = $("erroGeral");
const dialogoExcluir = $("dialogoExcluir");

const COLUNAS = 9;
const CAMPOS_TEXTO = ["nome", "categoria", "fornecedor"];
const CAMPOS_INTEIROS = ["quantidade_estoque", "estoque_minimo"];
const TODOS_CAMPOS = [...CAMPOS_TEXTO, "preco", "validade", ...CAMPOS_INTEIROS];
const ROTULOS = {
    nome: "o nome do produto",
    categoria: "a categoria",
    fornecedor: "o fornecedor",
    preco: "o preço",
    quantidade_estoque: "a quantidade",
    estoque_minimo: "o estoque mínimo",
};

const SITUACAO = {
    ok: { texto: "Em estoque", icone: "✓" },
    baixo: { texto: "Estoque baixo", icone: "▲" },
    sem_estoque: { texto: "Sem estoque", icone: "✕" },
};
const PESO_SITUACAO = { sem_estoque: 0, baixo: 1, ok: 2 };
const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- Estado ---------- */
let produtos = [];
let filtroAtual = "todos";
let idParaExcluir = null;

/* ---------- Utilitários ---------- */
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[c]);
}

function normalizar(texto) {
    return String(texto).toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}

function hojeISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatarData(iso) {
    if (!iso) return "—";
    const [ano, mes, dia] = iso.split("-");
    return `${dia}/${mes}/${ano}`;
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

function enviarJSON(metodo, corpo) {
    return {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
    };
}

/* ---------- Avisos (toast) ---------- */
function avisar(texto, tipo = "sucesso") {
    const aviso = document.createElement("div");
    aviso.className = `aviso ${tipo === "erro" ? "erro" : ""}`;
    aviso.textContent = texto;
    $("avisos").appendChild(aviso);
    setTimeout(() => aviso.remove(), tipo === "erro" ? 6000 : 3500);
}

/* ---------- Resumo ---------- */
function atualizarResumo() {
    const sem = produtos.filter((p) => p.situacao === "sem_estoque").length;
    const baixo = produtos.filter((p) => p.situacao === "baixo").length;
    const precisaRepor = sem + baixo;

    $("n-todos").textContent = produtos.length;
    $("n-baixo").textContent = baixo;
    $("n-sem").textContent = sem;

    resumo.classList.toggle("atencao", precisaRepor > 0);

    if (produtos.length === 0) {
        tituloResumo.textContent = "Nenhum produto cadastrado";
        subtituloResumo.textContent = "Cadastre o primeiro chocolate para começar a controlar o estoque.";
    } else if (precisaRepor === 0) {
        tituloResumo.textContent = "Estoque em dia";
        subtituloResumo.textContent = `${plural(produtos.length, "produto cadastrado", "produtos cadastrados")}, todos acima do mínimo.`;
    } else {
        tituloResumo.textContent = `${plural(precisaRepor, "produto precisa", "produtos precisam")} de reposição`;
        const partes = [];
        if (sem) partes.push(`${sem} sem estoque`);
        if (baixo) partes.push(`${baixo} com estoque baixo`);
        subtituloResumo.textContent = `${partes.join(" e ")}. Use os filtros abaixo para ver quais são.`;
    }
}

/* ---------- Lista ---------- */
function produtosVisiveis() {
    const termo = normalizar(campoBusca.value.trim());
    const lista = produtos.filter((p) => {
        if (filtroAtual !== "todos" && p.situacao !== filtroAtual) return false;
        if (!termo) return true;
        return [p.nome, p.categoria, p.fornecedor].some((v) => normalizar(v).includes(termo));
    });

    const ordem = seletorOrdem.value;
    if (ordem === "nome") {
        lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } else if (ordem === "atencao") {
        lista.sort((a, b) =>
            PESO_SITUACAO[a.situacao] - PESO_SITUACAO[b.situacao] ||
            a.nome.localeCompare(b.nome, "pt-BR"));
    } else {
        lista.sort((a, b) => b.id_produto - a.id_produto);
    }
    return lista;
}

function mostrarEsqueleto() {
    tabela.innerHTML = Array.from({ length: 4 }, () =>
        `<tr class="esqueleto" aria-hidden="true">${"<td><span></span></td>".repeat(COLUNAS)}</tr>`
    ).join("");
}

function linhaVazia(html) {
    return `<tr class="vazio-linha"><td colspan="${COLUNAS}" class="vazio">${html}</td></tr>`;
}

function renderizar() {
    atualizarResumo();
    atualizarSugestoes();
    const lista = produtosVisiveis();
    contador.textContent = produtos.length
        ? `Mostrando ${lista.length} de ${plural(produtos.length, "produto", "produtos")}.`
        : "";

    if (produtos.length === 0) {
        tabela.innerHTML = linhaVazia(
            `<strong>Seu estoque está vazio</strong>Cadastre o primeiro produto para ele aparecer aqui.<br>
             <button type="button" class="primario" data-abrir-novo>+ Novo produto</button>`);
        return;
    }
    if (lista.length === 0) {
        tabela.innerHTML = linhaVazia(
            `<strong>Nenhum produto encontrado</strong>Tente outro termo ou limpe os filtros.<br>
             <button type="button" class="secundario" data-limpar>Limpar filtros</button>`);
        return;
    }

    const hoje = hojeISO();
    tabela.innerHTML = lista.map((p) => {
        const s = SITUACAO[p.situacao];
        const nome = escaparHTML(p.nome);
        const vencido = p.validade && p.validade < hoje;
        return `
        <tr data-id="${p.id_produto}" class="${p.situacao === "sem_estoque" ? "linha-sem" : p.situacao === "baixo" ? "linha-baixo" : ""}">
            <td class="nome">${nome}</td>
            <td data-label="Categoria">${escaparHTML(p.categoria)}</td>
            <td data-label="Fornecedor">${escaparHTML(p.fornecedor)}</td>
            <td data-label="Preço" class="numero">${moeda.format(p.preco)}</td>
            <td data-label="Quantidade">
                <div class="ajuste">
                    <button type="button" data-acao="menos" aria-label="Diminuir 1 de ${nome}" ${p.quantidade_estoque === 0 ? "disabled" : ""}>−</button>
                    <output aria-label="Quantidade de ${nome}">${p.quantidade_estoque}</output>
                    <button type="button" data-acao="mais" aria-label="Aumentar 1 de ${nome}">+</button>
                </div>
            </td>
            <td data-label="Mínimo">${p.estoque_minimo}</td>
            <td data-label="Validade" class="numero">${formatarData(p.validade)}${vencido ? '<span class="selo-vencido">Vencido</span>' : ""}</td>
            <td data-label="Situação"><span class="selo ${p.situacao}"><span aria-hidden="true">${s.icone}</span>${s.texto}</span></td>
            <td class="acoes-celula">
                <div class="acoes-linha">
                    <button type="button" class="editar" data-acao="editar" aria-label="Editar ${nome}">Editar</button>
                    <button type="button" class="excluir" data-acao="excluir" aria-label="Excluir ${nome}">Excluir</button>
                </div>
            </td>
        </tr>`;
    }).join("");
}

function listaOpcoes(valores) {
    return [...new Set(valores)].sort((a, b) => a.localeCompare(b, "pt-BR"))
        .map((v) => `<option value="${escaparHTML(v)}">`).join("");
}

function atualizarSugestoes() {
    $("listaCategorias").innerHTML = listaOpcoes(produtos.map((p) => p.categoria));
    $("listaFornecedores").innerHTML = listaOpcoes(produtos.map((p) => p.fornecedor));
}

async function carregar() {
    mostrarEsqueleto();
    try {
        produtos = await chamarAPI(API);
        renderizar();
    } catch (erro) {
        tituloResumo.textContent = "Não foi possível carregar o estoque";
        subtituloResumo.textContent = erro.message;
        tabela.innerHTML = linhaVazia(
            `<strong>Falha ao carregar</strong>${escaparHTML(erro.message)}<br>
             <button type="button" class="secundario" data-recarregar>Tentar de novo</button>`);
    }
}

/* ---------- Ajuste rápido de quantidade ---------- */
async function ajustar(id, variacao, acao) {
    try {
        const atualizado = await chamarAPI(`${API}/${id}/quantidade`, enviarJSON("PATCH", { variacao }));
        produtos = produtos.map((p) => (p.id_produto === id ? atualizado : p));
        renderizar();
        // mantém o foco no mesmo botão para quem usa teclado
        document.querySelector(`tr[data-id="${id}"] [data-acao="${acao}"]:not(:disabled)`)?.focus();
    } catch (erro) {
        avisar(erro.message, "erro");
    }
}

/* ---------- Formulário (cadastro / edição) ---------- */
function limparErros() {
    erroGeral.hidden = true;
    erroGeral.textContent = "";
    formulario.querySelectorAll(".campo").forEach((c) => c.classList.remove("invalido"));
    formulario.querySelectorAll(".erro-campo").forEach((e) => (e.textContent = ""));
    formulario.querySelectorAll("input").forEach((i) => i.removeAttribute("aria-invalid"));
}

function mostrarErroCampo(nome, mensagem) {
    const campo = $(nome);
    campo.closest(".campo").classList.add("invalido");
    campo.setAttribute("aria-invalid", "true");
    $(`erro-${nome}`).textContent = mensagem;
}

function abrirFormulario(produto = null) {
    formulario.reset();
    limparErros();
    campoId.value = produto ? produto.id_produto : "";
    $("tituloDialogo").textContent = produto ? "Editar produto" : "Novo produto";
    botaoSalvar.textContent = produto ? "Salvar alterações" : "Cadastrar produto";
    if (produto) {
        TODOS_CAMPOS.forEach((c) => ($(c).value = produto[c] ?? ""));
        $("preco").value = String(produto.preco).replace(".", ",");
    }
    dialogoProduto.showModal();
    $("nome").focus();
}

function lerPreco() {
    const bruto = $("preco").value.trim().replace(",", ".");
    return bruto === "" ? NaN : Number(bruto);
}

function validarFormulario() {
    let valido = true;
    let primeiroInvalido = null;
    const falhar = (campo, msg) => {
        mostrarErroCampo(campo, msg);
        valido = false;
        primeiroInvalido ??= campo;
    };

    CAMPOS_TEXTO.forEach((c) => {
        if (!$(c).value.trim()) falhar(c, `Informe ${ROTULOS[c]}.`);
    });

    if (!$("preco").value.trim()) falhar("preco", "Informe o preço.");
    else if (!Number.isFinite(lerPreco())) falhar("preco", "Use um valor válido, como 12,90.");
    else if (lerPreco() < 0) falhar("preco", "O preço não pode ser negativo.");

    CAMPOS_INTEIROS.forEach((c) => {
        const bruto = $(c).value.trim();
        const n = Number(bruto);
        if (bruto === "") falhar(c, `Informe ${ROTULOS[c]}.`);
        else if (!Number.isInteger(n)) falhar(c, "Use um número inteiro, sem vírgula.");
        else if (n < 0) falhar(c, "O valor não pode ser negativo.");
    });

    if (primeiroInvalido) $(primeiroInvalido).focus();
    return valido;
}

formulario.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    limparErros();
    if (!validarFormulario()) return;

    const id = campoId.value;
    const corpo = {
        nome: $("nome").value.trim(),
        categoria: $("categoria").value.trim(),
        fornecedor: $("fornecedor").value.trim(),
        preco: lerPreco(),
        validade: $("validade").value || null,
        quantidade_estoque: Number($("quantidade_estoque").value),
        estoque_minimo: Number($("estoque_minimo").value),
    };

    const rotuloOriginal = botaoSalvar.textContent;
    botaoSalvar.disabled = true;
    botaoSalvar.textContent = "Salvando…";
    try {
        const resultado = await chamarAPI(id ? `${API}/${id}` : API, enviarJSON(id ? "PUT" : "POST", corpo));
        dialogoProduto.close();
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        erroGeral.textContent = erro.message;
        erroGeral.hidden = false;
    } finally {
        botaoSalvar.disabled = false;
        botaoSalvar.textContent = rotuloOriginal;
    }
});

/* ---------- Exclusão com confirmação ---------- */
function pedirExclusao(produto) {
    idParaExcluir = produto.id_produto;
    $("textoExcluir").textContent = `“${produto.nome}” e o histórico de movimentações dele serão removidos. Essa ação não pode ser desfeita.`;
    dialogoExcluir.showModal();
}

$("confirmarExclusao").addEventListener("click", async () => {
    const id = idParaExcluir;
    dialogoExcluir.close();
    try {
        const resultado = await chamarAPI(`${API}/${id}`, { method: "DELETE" });
        avisar(resultado.mensagem);
        await carregar();
    } catch (erro) {
        avisar(erro.message, "erro");
    }
});
$("cancelarExclusao").addEventListener("click", () => dialogoExcluir.close());

/* ---------- Filtros e busca ---------- */
function definirFiltro(filtro) {
    filtroAtual = filtro;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filtro === filtro)));
    renderizar();
}

function limparFiltros() {
    campoBusca.value = "";
    definirFiltro("todos");
}

chips.forEach((chip) => chip.addEventListener("click", () => definirFiltro(chip.dataset.filtro)));
campoBusca.addEventListener("input", renderizar);
seletorOrdem.addEventListener("change", renderizar);

/* ---------- Eventos gerais (delegação) ---------- */
$("botaoNovo").addEventListener("click", () => abrirFormulario());
$("fecharDialogo").addEventListener("click", () => dialogoProduto.close());
$("botaoCancelar").addEventListener("click", () => dialogoProduto.close());

// fechar clicando fora da caixa
[dialogoProduto, dialogoExcluir].forEach((d) =>
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));

tabela.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;

    if (alvo.hasAttribute("data-abrir-novo")) return abrirFormulario();
    if (alvo.hasAttribute("data-limpar")) return limparFiltros();
    if (alvo.hasAttribute("data-recarregar")) return carregar();

    const linha = alvo.closest("tr[data-id]");
    if (!linha) return;
    const id = Number(linha.dataset.id);
    const produto = produtos.find((p) => p.id_produto === id);
    const acao = alvo.dataset.acao;

    if (acao === "mais") ajustar(id, +1, acao);
    else if (acao === "menos") ajustar(id, -1, acao);
    else if (acao === "editar") abrirFormulario(produto);
    else if (acao === "excluir") pedirExclusao(produto);
});

carregar();