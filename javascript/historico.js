const API = "/movimentacoes?limite=300";
const $ = (id) => document.getElementById(id);

const corpo = $("listaMovimentacoes");
const campoBusca = $("busca");
const seletorPeriodo = $("periodo");
const chips = document.querySelectorAll(".chip");
const COLUNAS = 6;

let movimentacoes = [];
let filtroTipo = "todos";

/* ---------- Utilitários ---------- */
function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[c]);
}
function normalizar(texto) {
    return String(texto ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function plural(n, singular, pluralTexto) {
    return `${n} ${n === 1 ? singular : pluralTexto}`;
}

// O banco guarda a data em UTC ("AAAA-MM-DD HH:MM:SS"); aqui ela vira horário local.
function lerData(texto) {
    return new Date(String(texto).replace(" ", "T") + "Z");
}
function chaveDia(data) {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}
function diasAtras(data) {
    const hoje = new Date();
    const a = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const b = new Date(data.getFullYear(), data.getMonth(), data.getDate());
    return Math.round((a - b) / 86400000);
}
function rotuloDia(data) {
    const completo = data.toLocaleDateString("pt-BR");
    const dif = diasAtras(data);
    if (dif === 0) return `Hoje · ${completo}`;
    if (dif === 1) return `Ontem · ${completo}`;
    return completo;
}
function hora(data) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/* ---------- Filtros ---------- */
function passaPeriodoEBusca(m) {
    const periodo = seletorPeriodo.value;
    const dif = diasAtras(m.data);
    if (periodo === "hoje" && dif !== 0) return false;
    if (periodo === "7" && dif > 6) return false;

    const termo = normalizar(campoBusca.value.trim());
    if (!termo) return true;
    return [m.produto, m.observacao, m.funcionario].some((v) => normalizar(v).includes(termo));
}

/* ---------- Tela ---------- */
function linhaVazia(html) {
    return `<tr class="vazio-linha"><td colspan="${COLUNAS}" class="vazio">${html}</td></tr>`;
}

function renderizar() {
    const base = movimentacoes.filter(passaPeriodoEBusca);
    const lista = base.filter((m) => filtroTipo === "todos" || m.tipo === filtroTipo);

    // contadores dos chips (respeitam período e busca)
    $("n-todos").textContent = base.length;
    $("n-entrada").textContent = base.filter((m) => m.tipo === "entrada").length;
    $("n-saida").textContent = base.filter((m) => m.tipo === "saida").length;

    // resumo do topo (do que está na lista)
    const entradas = lista.filter((m) => m.tipo === "entrada");
    const saidas = lista.filter((m) => m.tipo === "saida");
    const unEntrada = entradas.reduce((s, m) => s + m.quantidade, 0);
    const unSaida = saidas.reduce((s, m) => s + m.quantidade, 0);

    if (movimentacoes.length === 0) {
        $("subtituloHistorico").textContent = "Ainda não há movimentações registradas.";
    } else if (lista.length === 0) {
        $("subtituloHistorico").textContent = "Nenhuma movimentação com esses filtros.";
    } else {
        $("subtituloHistorico").textContent =
            `${plural(entradas.length, "entrada", "entradas")} (+${unEntrada} un.) e ` +
            `${plural(saidas.length, "saída", "saídas")} (−${unSaida} un.) no que está sendo mostrado.`;
    }
    $("contador").textContent = movimentacoes.length
        ? `Mostrando ${lista.length} de ${plural(movimentacoes.length, "movimentação carregada", "movimentações carregadas")}.`
        : "";

    if (movimentacoes.length === 0) {
        corpo.innerHTML = linhaVazia(
            `<strong>Nenhuma movimentação ainda</strong>
             Elas aparecem aqui quando você cadastra um produto ou usa os botões + e − na lista de estoque.<br>
             <a class="botao-link" href="/">Ir para o estoque</a>`);
        return;
    }
    if (lista.length === 0) {
        corpo.innerHTML = linhaVazia(
            `<strong>Nada encontrado</strong>Tente outro período ou limpe a busca.<br>
             <button type="button" class="secundario" data-limpar>Limpar filtros</button>`);
        return;
    }

    // agrupa por dia (a lista já vem da mais recente para a mais antiga)
    let diaAtual = "";
    corpo.innerHTML = lista.map((m) => {
        const chave = chaveDia(m.data);
        let cabecalho = "";
        if (chave !== diaAtual) {
            diaAtual = chave;
            const doDia = lista.filter((x) => chaveDia(x.data) === chave).length;
            cabecalho = `<tr class="dia-linha"><th colspan="${COLUNAS}" scope="colgroup">${rotuloDia(m.data)}
                <span class="dia-resumo">${plural(doDia, "movimentação", "movimentações")}</span></th></tr>`;
        }
        const entrada = m.tipo === "entrada";
        return `${cabecalho}
        <tr>
            <td data-label="Hora" class="numero">${hora(m.data)}</td>
            <td class="nome">${escaparHTML(m.produto)}</td>
            <td data-label="Tipo"><span class="selo ${entrada ? "entrada" : "saida"}"><span aria-hidden="true">${entrada ? "↑" : "↓"}</span>${entrada ? "Entrada" : "Saída"}</span></td>
            <td data-label="Quantidade" class="numero qtd ${entrada ? "entrada" : "saida"}">${entrada ? "+" : "−"}${m.quantidade}</td>
            <td data-label="Observação">${escaparHTML(m.observacao || "—")}</td>
            <td data-label="Funcionário">${escaparHTML(m.funcionario)}</td>
        </tr>`;
    }).join("");
}

async function carregar() {
    corpo.innerHTML = Array.from({ length: 4 }, () =>
        `<tr class="esqueleto" aria-hidden="true">${"<td><span></span></td>".repeat(COLUNAS)}</tr>`).join("");
    try {
        const resposta = await fetch(API);
        if (!resposta.ok) throw new Error("Não foi possível buscar o histórico.");
        const dados = await resposta.json();
        movimentacoes = dados.map((m) => ({ ...m, data: lerData(m.data_movimentacao) }));
        renderizar();
    } catch (erro) {
        $("subtituloHistorico").textContent = "Não foi possível carregar o histórico.";
        corpo.innerHTML = linhaVazia(
            `<strong>Falha ao carregar</strong>Confira se o Flask está rodando.<br>
             <button type="button" class="secundario" data-recarregar>Tentar de novo</button>`);
    }
}

function definirFiltro(filtro) {
    filtroTipo = filtro;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filtro === filtro)));
    renderizar();
}

chips.forEach((chip) => chip.addEventListener("click", () => definirFiltro(chip.dataset.filtro)));
campoBusca.addEventListener("input", renderizar);
seletorPeriodo.addEventListener("change", renderizar);
$("botaoAtualizar").addEventListener("click", carregar);

corpo.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button");
    if (!alvo) return;
    if (alvo.hasAttribute("data-recarregar")) return carregar();
    if (alvo.hasAttribute("data-limpar")) {
        campoBusca.value = "";
        seletorPeriodo.value = "tudo";
        definirFiltro("todos");
    }
});

carregar();