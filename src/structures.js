const { readMemory, writeMemory, UINT32 } = require("memoryjs");

const { memoryBase, processObject, GAME, BUILD, worldId, settings, tasks } = require("./main");
const { BUILDS } = require("./constants");

class Memory {
    /**
     * @param {String} address
     * @param {String} type
     * @returns 
     */
    static read(address, type) {
        return readMemory(processObject().handle, memoryBase + address, type);
    }
    /**
     * @param {String} address
     * @param {String|Number} value
     * @param {String} type
     * @returns 
     */
    static write(address, value, type) {
        return writeMemory(processObject().handle, memoryBase + address, value, type);
    }
}

class Node {
    static oId = [0x18, 0x18];
    static oState = [0x54, 0x44];
    static oNumChildren = [0xa0, 0x90];
    static oChildrenArray = [0xa4, 0x94];
    static oNumParents = [0x94, 0x84];
    static oParentsArray = [0x98, 0x88];
    static oJob = [0x7c, 0x6c];
    static oCheckpoint = [0xb8, 0xa8];

    /**
     * @param {Number} address
     */
    constructor(address) {
        /**
         * @type {Number}
         */
        this.address = address;

        // we only populate the edges array once bc we assume it won't change
        this.edges = this.children;
    }

    /**
     * @returns {Number}
     */
    get id() {
        return Memory.read(this.address + Node.oId[GAME()], UINT32);
    }

    // get the current state of the task (0, 1, 2, 3)
    /**
     * @type {0|1|2|3}
     */
    get state() {
        return Memory.read(this.address + Node.oState[GAME()], UINT32);
    }
    get stateName() {
        const state = this.state;
        if (state == 0)
            return "Unavailable";
        if (state == 1)
            return "Available";
        if (state == 2)
            return "Complete";
        if (state == 3)
            return "Final";
        return "Unknown";
    }

    set state(val) {
        Memory.write(this.address + Node.oState[GAME()], val, UINT32);
    }

    get children() {
        let children = [];
        let numChildren = Memory.read(this.address + Node.oNumChildren[GAME()], UINT32);
        let childrenArray = Memory.read(this.address + Node.oChildrenArray[GAME()], UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numChildren; i++)
            children.push(Memory.read(childrenArray + i*4, UINT32));
        return children;
    }

    get parents() {
        let parents = [];
        let numParents = Memory.read(this.address + Node.oNumParents[GAME()], UINT32);
        let parentsArray = Memory.read(this.address + Node.oParentsArray[GAME()], UINT32); // retail: a4, proto: 98
        for (let i = 0; i < numParents; i++)
            parents.push(Memory.read(parentsArray + i*4, UINT32));
        return parents;
    }

    // get the job pointer for the task
    get job() {
        return Memory.read(this.address + Node.oJob[GAME()], UINT32); //retail
        //return readMemory(this.address + 0x74, memoryjs.UINT32); //proto
    }

    // get the checkpoint for this node
    get checkpoint() {
        return Memory.read(this.address + Node.oCheckpoint[GAME()], UINT32);
    }

    // get the tasks's name based on its ID
    get name() {
        if ((BUILD() == BUILDS.sly2ntsc) && (String(this.id) in tasks()[BUILD()][String(worldId())]))
            return tasks()[BUILD()][String(worldId())][String(this.id)].name;
        else
            return `0x${this.address.toString(16)}`;
    }

    get description() {
        if ((BUILD() == BUILDS.sly2ntsc) && (String(this.id) in tasks()[BUILD()][String(worldId())]))
            return tasks()[BUILD()][String(worldId())][String(this.id)].desc;
        else
            return `Node at address 0x${this.address}`;
    }

    get type() {
        if ((BUILD() == BUILDS.sly2ntsc) && (String(this.id) in tasks()[BUILD()][String(worldId())]))
            return tasks()[BUILD()][String(worldId())][String(this.id)].type;
        else
            return 'Task';
    }

    // generate the style string for the dot node
    get style() {
        /* colors:
            0: red
            1: green
            2: blue
            3: gray */
    
        let label;
        if (settings().nodesDisplay == 'name')
            label = this.name;
        else if (settings().nodesDisplay == 'id-hex')
            label = `0x${this.id.toString(16)}`;
        else if (settings().nodesDisplay == 'address')
            label = `0x${this.address.toString(16)}`;
        else if (settings().nodesDisplay == 'state')
            label = this.state;
        else
            label = this.id;

        let tooltip = this.description.split('"').join('\\"');
        let fillcolor = ['#F77272', '#9EE89B', '#61D6F0', '#C2C2C2'][this.state];
        let color = ['#8A0808', '#207F1D', '#0C687D', '#4E4E4E'][this.state];
        let shape = (this.checkpoint == 0xFFFFFFFF)
            ? (this.type == 'Chalktalk')
                ? 'octagon'
                : 'oval'
            : 'diamond';
        return `[label="${label}" tooltip="${tooltip}" fillcolor="${fillcolor}" ` +
                `color="${color}" shape="${shape}" width=1 height=0.5]`;
    }

    /**
     * force the state of the task, maintaining the rules of the dag
     * @param {Number} newState
     * @param {Number[]} visited
     */
    forceState(newState, visited=[]) {
        if (visited.indexOf(this.id) > -1)
            return; // if already checked, skip

        visited[this.id] = newState; // now we're checking it, so add to visited array

        if (newState < 0 || newState > 3)
            return; // if attempting to set an invalid value, abort
        if (newState == this.state)
            return; // this state is already target, abort
        if (newState == 2 && this.job == 0)
            newState = 3; // override setting a node outside a job to 2

        // iterate parents
        for (const parent of this.parents) {
            const p = new Node(parent);

            if (newState == UNAVAILABLE) {
                // if target state is unavailable
                if (p.state in [UNAVAILABLE, AVAILABLE])
                    // if parent state is unvailable or available
                    // no change to parent is needed
                    p.forceState(p.state, visited);
                else
                    // if parent state is complete or final
                    // parent should be available
                    p.forceState(AVAILABLE, visited);
            } else {
                // if target state is available, complete, or final
                if (p.job == 0)
                    // if parent is not in a job, it should be final
                    p.forceState(FINAL, visited);
                else if (p.job != this.job)
                    // if parent is in a job, and it's not the same as this nodes' job
                    // it must be the last node in a job so, it must be final
                    p.forceState(FINAL, visited);
                else {
                    // if parent is in a job, and it is the same as this node's job
                    if (newState == AVAILABLE)
                        // if target state is available, parent must be complete
                        p.forceState(COMPLETE, visited)
                    else
                        // if the target state is complete or final
                        // parent must be complete or final, but either way
                        // it should be the same a this node
                        p.forceState(newState, visited);
                }
            }
        }

        // actually update dag state
        this.state = newState;

        // iterate children
        for (const child of this.children) {
            const c = new Node(child);

            if (newState in [UNAVAILABLE, AVAILABLE])
                // if target state is unavailable or available,
                // child must be unavailable
                c.forceState(UNAVAILABLE, visited);
            else if (newState == COMPLETE) {
                // if target state is complete...
                for (const child2 of c.children) {
                    if (child2.state in [AVAILABLE, COMPLETE])
                        // if child2 has a child that is available or complete,
                        // child must be complete
                        c.forceState(COMPLETE, visited);
                    else if (child2.state == UNAVAILABLE)
                        c.forceState(UNAVAILABLE);
                    else
                        // otherwise, it must be available
                        c.forceState(AVAILABLE, visited);
                }
            } else {
                // if target state is final...
                if (c.job == this.job)
                    // if child node is in same job as this node,
                    // child must be final
                    c.forceState(FINAL, visited);
                else
                    // otherwise, it must be available
                    c.forceState(AVAILABLE, visited);
            }
        }
    }

    // generate the dot language text for the node
    dotNode() {
        return `"${this.address.toString(16)}" ${this.style}`;
    }

    // generate the dot language text for the node's edges
    dotEdges() {
        let dots = [];
        let edges = this.edges;
        for (const e of edges)
            dots.push(`"${this.address.toString(16)}" -> "${e.toString(16)}"`);
        return dots.join('\n');
    }
}

class Graph {
    constructor() {
        this.head;
        this.clusters = {};
        this.edgeText = '';
    }

    clear() {
        this.head = undefined;
        this.clusters = {};
        this.edgeText = '';
    }

    populateGraph(head) {
        this.clear()
        this.head = head;
        var visited = [];
        try {
            this.populateChildren(head, visited);
        } catch (e) {
            console.error("Error populating dag");
            console.error(e);
        }
    }

    // recursively populate the dag with a node and it's children
    populateChildren(nodeAddress, visited) {
        // add node to visited array so we don't check it twice
        if (visited.indexOf(nodeAddress) > 0)
            return;
        visited.push(nodeAddress);

        if (visited.length > 500)
            throw new Error("Maximum DAG size exceeded");

        const node = new Node(nodeAddress);

        // add node to cluster in dag based on job
        const job = node.job;
        if (!(job in this.clusters))
            this.clusters[job] = new Subgraph(job);
        this.clusters[node.job].nodes.push(node);

        // add node edges to task (we only do this once because we assume they won't change)
        this.edgeText += `\t${node.dotEdges()}\n`;

        // recursively add it's children to the graph
        for (const edge of node.edges) {
            if (!(this.edge in visited)) {
                this.populateChildren(edge, visited);
            }
        }
    }

    // reset dag to clean state
    reset() {
        for (const cluster of Object.values(this.clusters)) {
            for (const node of cluster.nodes) {
                if (node.numParents == 0)
                    node.state = 1;
                else
                    node.state = 0;
            }
        }
    }

    // generate the dot language text for the graph
    dot() {
        // init digraph with default styles for graph/node
        const dots = [
            'digraph {',
            'graph [style="bold, rounded" bgcolor="#ffffff00" fontname="courier"]',
            'node [style="filled, bold, rounded" fontname="calibri" fontcolor="black" shape="oval"]',
            'fillcolor="#ffffff00"'
        ];

        // generate dot strings for each cluster and append them to the graph
        for (const [id, cluster] of Object.entries(this.clusters)) {
            if (id == 0)
                dots.push(cluster.dot(false));
            else
                dots.push(cluster.dot());
        }

        // append pre-populated edge strings to the graph
        dots.push(`${this.edgeText}}`);
        return dots.join('\n');
    }
}

class Subgraph {
    /**
     * @param {Number} id
     */
    constructor(id) {
        /**
         * @type {Number}
         */
        this.id = id;
        this.nodes = [];
    }

    // generate the dog language text for the subgraph
    dot(cluster=true) {
        const dots = [];

        // nodes that aren't in a job shouldn't have the cluster- prefix
        if (cluster)
            dots.push(`\tsubgraph cluster${this.id.toString(16)} {`);
        else
            dots.push(`\tsubgraph ${this.id.toString(16)} {`);

        //dots.push(`\tlabel="${hex(this.id)}"\n\tbgcolor="#ffffff40"`);

        for (const node of this.nodes)
            dots.push('\t\t' + node.dotNode());

        dots.push('\t}\n');
        return dots.join('\n');
    }
}

module.exports = {
    Graph,
    Memory,
    Node,
    Subgraph
}