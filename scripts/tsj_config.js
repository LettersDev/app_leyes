/**
 * Mapeo de Salas del TSJ de Venezuela
 * Estos IDs son los utilizados por los portlets de Liferay en tsj.gob.ve
 */
const SALA_MAP = {
    '005': {
        name: 'Sala Constitucional',
        code: 'scon',
        short: 'Constitucional'
    },
    '002': {
        name: 'Sala Político-Administrativa',
        code: 'spa',
        short: 'Político'
    },
    '003': {
        name: 'Sala Electoral',
        code: 'selec',
        short: 'Electoral'
    },
    '004': {
        name: 'Sala de Casación Civil',
        code: 'scc',
        short: 'Civil'
    },
    '006': {
        name: 'Sala de Casación Penal',
        code: 'scp',
        short: 'Penal'
    },
    '007': {
        name: 'Sala de Casación Social',
        code: 'scs',
        short: 'Social'
    },
    '001': {
        name: 'Sala Plena',
        code: 'splena',
        short: 'Plena'
    }
};

module.exports = { SALA_MAP };
