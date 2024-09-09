import { v4 as uuid } from 'uuid';

const getElementAttrs = (element) => {
    const attrs = {};
    for (let attr of element.attributes) {
        attrs[attr.nodeName] = attr.nodeValue;
    }
    return attrs;
};
const setElementAttrs = (element, attrs) => {
    Object.entries(attrs).forEach(([name, value]) => {
        element.setAttribute(name, value);
    });
};
const removeAttrNode = (element, name) => {
    const attrNode = element.getAttributeNode(name);
    return attrNode && element.removeAttributeNode(attrNode);
};
const removeAttr = (element, name) => {
    const attrNode = removeAttrNode(element, name);
    return attrNode && attrNode.nodeValue;
};
const SafeRenderer = {
    forHtml: (templateData, ...values) => {
        let result = templateData[0];
        for (let i = 0; i < values.length; i++) {
            result += String(values[i])
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
            result += templateData[i + 1];
        }
        return result;
    }
};
const renderHtmlInScope = (templateString, context) => {
    return renderValueInScope(`(${SafeRenderer.forHtml})\`${templateString}\``, context);
};
const renderValueInScope = (expression, context = {}) => {
    const paramNames = [];
    const paramValues = [];
    let thisObj;
    Object.entries(context).forEach(([name, value]) => {
        if (name == 'this') {
            thisObj = value;
        } else {
            paramNames.push(name);
            paramValues.push(value);
        }
    });
    const renderFunction = new Function(paramNames, `
		return ${expression};
	`);
    return renderFunction.apply(thisObj, paramValues);
};
const nodesToDocumentFragment = (nodes) => {
    return Array.from(nodes).reduce((fragment, node) => {
        fragment.appendChild(node);
        return fragment;
    }, document.createDocumentFragment());
};
const replaceNodes = (oldNodes, newNodes) => {
    nodesToDocumentFragment(oldNodes.slice(1));
    oldNodes[0].replaceWith(nodesToDocumentFragment(newNodes));
};
const removeNodesSet = (set) => {
    set.forEach(item => {
        if (item instanceof Node) {
            item.remove();
        } else {
            removeNodesSet(item);
        }
    });
};
const insertNodeBefore = (nodeToInsert, node) => {
    node.parentNode.insertBefore(nodeToInsert, node);
};
const insertNodeAfter = (nodeToInsert, node) => {
    node.nextSibling ? insertNodeBefore(nodeToInsert, node.nextSibling) : node.parentNode.appendChild(nodeToInsert);
};
const loadComponentDefine = async (component) => {
    //component应该是一个组件的定义对象，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个组件的定义对象
    return component instanceof Promise ? (await component).default : component;
};
const loadSourceString = async (source) => {
    //source应该是一个字符串，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个字符串
    return source instanceof Promise ? (await source).default : source;
};
const loadPluginMethod = async (plugin) => {
    //plugin应该是一个插件的安装函数，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个插件的安装函数
    return plugin instanceof Promise ? (await plugin).default : plugin;
};




class Stack {
    constructor() {
        Object.defineProperties(this, {
            _items: {
                value: [],
            },
        });
    }

    push(element) {
        this._items.push(element);
    }

    pop() {
        return this._items.pop();
    }

    peek() {
        return this._items[this._items.length - 1];
    }
}
class ObserverManager {
    constructor() {
        Object.defineProperties(this, {
            _map: {
                value: {},
            },
            _symbolForTargetSelf: {
                value: Symbol(),
            },
        });
    }

    /**
     * @param {*} observer 
     * @param {*} target 
     * @param {*} prop  当观察者观察的是target本身，而不是target下的具体某个属性时，不需要传prop
     */
    add(observer, target, prop = this._symbolForTargetSelf) {
        if (!observer) {
            return;
        }
        const temp = this._map[target._proxyUuid] ||= {};
        const observers = temp[prop] ||= new Set();//需要注意内存泄漏
        observers.add(observer);
    }

    notify(target, prop, propsChanged) {
        const temp = this._map[target._proxyUuid] || {};
        //该属性的观察者
        temp[prop] && temp[prop].forEach(observer => {
            observer.process(target, prop);
        });
        if (propsChanged) {
            //该属性所属对象本身的观察者
            temp[this._symbolForTargetSelf] && temp[this._symbolForTargetSelf].forEach(observer => {
                observer.process(target, prop);
            });
        }
    }
}
class Observer {
    constructor(callback) {
        Object.defineProperties(this, {
            _callback: {
                value: callback,
            },
        });
    }

    process(target, prop) {
        this._callback(target, prop);
    }
}
const isProxyObj = (obj) => {
    return typeof obj == 'object' && !!obj._proxyUuid;
};
const tryCreateProxy = (obj) => {
    if (typeof obj != 'object' || isProxyObj(obj) || obj instanceof Date) {
        return obj;
    }
    const proxyObj = new Proxy(obj, {
        has(target, prop) {
            const has = Reflect.has(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!has || (propDesc && propDesc.writable)) {
                OBSERVER_MANAGER.add(OBSERVER_STACK.peek(), target, prop);
            }
            return has;
        },
        get(target, prop) {
            const has = Reflect.has(target, prop);
            let value = Reflect.get(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!has || (propDesc && propDesc.writable)) {
                value = tryCreateProxy(value);
                if (isProxyObj(value)) {
                    Reflect.set(target, prop, value);
                }
                OBSERVER_MANAGER.add(OBSERVER_STACK.peek(), target, prop);
            }
            return value;
        },
        ownKeys(target) {
            const result = Reflect.ownKeys(target);
            OBSERVER_MANAGER.add(OBSERVER_STACK.peek(), target);
            return result;
        },
        set(target, prop, value) {//如果加了receiver，就会和defineProperty重复触发
            const propsChanged = !Reflect.has(target, prop);
            const oldValue = Reflect.get(target, prop);
            value = tryCreateProxy(value);
            const result = Reflect.set(target, prop, value);
            if (value != oldValue
                || (Array.isArray(target) && prop == 'length')) {
                OBSERVER_MANAGER.notify(target, prop, propsChanged);
            }
            return result;
        },
        deleteProperty(target, prop) {
            const result = Reflect.deleteProperty(target, prop);
            OBSERVER_MANAGER.notify(target, prop, true);
            return result;
        },
        defineProperty(target, prop, attributes) {
            const result = Reflect.defineProperty(target, prop, attributes);
            OBSERVER_MANAGER.notify(target, prop, true);
            return result;
        },
    });
    Object.defineProperties(proxyObj, {
        _proxyUuid: {
            value: uuid(),
        },
    });
    return proxyObj;
};
const OBSERVER_MANAGER = new ObserverManager();
const OBSERVER_STACK = new Stack();







const wiyEnv = {
    get publicPath() {
        try {
            return process.env.WIY.PUBLIC_PATH;
        } catch {
            return '/';
        }
    }
};










class Component extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _rawThis: {
                value: this,
            },
            _proxyThis: {
                value: tryCreateProxy(this),
            },
            _uuid: {
                value: uuid(),
            },
            _config: {
                value: config,
            },
            _parent: {
                writable: true,
            },
            _children: {
                value: new Set(),//需要注意内存泄漏
            },
            _pointer: {
                writable: true,
            },
            _dom: {
                writable: true,
            },
            _managedNodes: {
                value: new Set(),//需要注意内存泄漏
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new Event('init'));
        });
    }

    async init() {
        this._config.context = {
            wiy: {
                router: this._config.app._router,
            },
            this: this._proxyThis,
        };
        this._config.components ||= {};

        Object.entries(this._config.components).forEach(([name, value]) => {
            this._config.components[name.toUpperCase()] = value;
        });
        Object.entries(this._config.methods || {}).forEach(([name, value]) => {
            Object.defineProperty(this, name, {
                value: value.bind(this._proxyThis),
            });
        });
        Object.entries(this._config.lifecycle || {}).forEach(([name, value]) => {
            this.addEventListener(name, value.bind(this._proxyThis));
        });
        Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
            value.forEach(listener => {
                this.addEventListener(name, listener);
            });
        });
        Object.entries(this._config.data || {}).forEach(([name, value]) => {
            this[name] = value;
        });
        for (let [name, value] of Object.entries(this._config.dataBinders || {})) {
            await value(this);
        }
    }

    getUuid() {
        return this._uuid;
    }

    setData(data) {
        Object.entries(data || {}).forEach(([name, value]) => {
            if (typeof value != 'undefined') {
                this._proxyThis[name] = value;
            }
        });
    }

    attr(name) {
        return this._config.attrs[name];
    }

    on(eventType, listener) {
        this._rawThis.addEventListener(eventType, listener);
    }

    trigger(eventType, data) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data));
    }

    addChild(component) {
        const oldParent = component._parent;
        if (oldParent) {
            oldParent.removeChild(component);
        }
        this._children.add(component);
        component._parent = this;
        this._managedNodes.add(component._managedNodes);
    }

    removeChild(component) {
        if (!this._children.has(component)) {
            throw new Error(`${component._uuid}不是${this._uuid}的子组件`);
        }
        this._children.delete(component);
        component._parent = null;
        this._managedNodes.delete(component._managedNodes);
    }

    async refresh() {
        if (!this.isConnected()) {//这里需要销毁旧的对象及相关资源
            return;
        }

        const oldPointer = this._pointer;

        this._managedNodes.delete(oldPointer);
        removeNodesSet(this._managedNodes);
        this._managedNodes.clear();

        this._children.forEach(child => {
            this.removeChild(child);
        });

        await this.generateDom();
        await this.replaceTo(oldPointer);
    }

    async replaceTo(node) {
        if (!this._dom) {
            await this.generateDom();
        }
        node.replaceWith(nodesToDocumentFragment(this._dom));
    }

    async appendTo(element) {
        const temp = document.createComment('');
        element.appendChild(temp);
        await this.replaceTo(temp);
    }

    async generateDom() {
        const nodes = await this.renderNodes();
        this._pointer = document.createComment(`${this._uuid}`);
        this._dom = [this._pointer, ...nodes];
        this._dom.forEach(node => {
            this._managedNodes.add(node);
        });
    }

    isConnected() {
        return this._pointer && this._pointer.isConnected;
    }

    getParents() {
        const parents = [];
        let temp = this;
        while (temp = temp._parent) {
            parents.push(temp);
        }
        return parents;
    }

    async mount(element) {
        setElementAttrs(element, {
            uuid: this._uuid,
            ...this._config.attrs,
        });
        Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
            element.addEventListener(name, value);
        });

        let root = element;
        if (this._config.template) {
            root = element.attachShadow({ mode: 'closed' });
        }
        root.innerHTML = await loadSourceString(this._config.template) || '';

        let cssCode = await loadSourceString(this._config.style) || '';
        if (cssCode) {
            cssCode = cssCode.replaceAll(':root', ':root,:host');

            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = URL.createObjectURL(new Blob([cssCode], { type: 'text/css' }));
            root.prepend(style);
        }

        await this.renderNode(root);
        element.wiyComponent = this;
        this.dispatchEvent(new Event('mount'));
    }

    async observe(func, callback) {
        const startObserve = async () => {
            OBSERVER_STACK.push(observer);
            try {
                return await callback(func());
            } finally {
                OBSERVER_STACK.pop();
            }
        };
        const observer = new Observer(() => {
            startObserve();
        });
        return await startObserve();
    }

    async renderNode(node, extraContext) {
        switch (node.nodeType) {
            case Node.TEXT_NODE:
            case Node.ATTRIBUTE_NODE:
                await this.renderTextOrAttr(node, extraContext);
                break;
            case Node.DOCUMENT_FRAGMENT_NODE:
                await this.renderChildNodes(node, extraContext);
                break;
            case Node.ELEMENT_NODE:
                await this.renderElement(node, extraContext);
                break;
        }
    }

    async renderTextOrAttr(node, extraContext) {
        const originNodeValue = node.nodeValue;
        let firstRender = true;
        let prevResult;
        await this.observe(() => {
            return this.renderString(originNodeValue, extraContext);
        }, (result) => {
            if (!firstRender && prevResult == result) {
                return;
            }
            firstRender = false;
            prevResult = node.nodeValue = result;
        });
    }

    async renderElement(node, extraContext) {
        if (node.hasAttribute('wiy:if')) {
            this.renderIf(node, extraContext);
            return;
        }
        if (node.hasAttribute('wiy:for')) {
            this.renderFor(node, extraContext);
            return;
        }
        const listeners = {};
        const dataBinders = {};
        for (let attrNode of node.attributes) {
            await this.renderNode(attrNode, extraContext);
            const attrName = attrNode.nodeName;
            if (attrName.startsWith('wiy:')) {
                const attrValue = removeAttr(node, attrName);
                if (attrName.startsWith('wiy:on')) {
                    const eventType = attrName.slice(6);
                    const eventHandler = (e) => {
                        const handler = this.renderValue(attrValue, extraContext);
                        if (typeof handler == 'function') {
                            handler(e, node);
                        }
                    };
                    node.addEventListener(eventType, eventHandler);
                    listeners[eventType] = [
                        ...(listeners[eventType] || []),
                        eventHandler,
                    ];
                } else if (attrName == 'wiy:html') {
                    await this.observe(() => {
                        return this.renderValue(attrValue, extraContext);
                    }, (result) => {
                        if (typeof result == 'undefined') {
                            delete node.innerHTML;
                        } else {
                            node.innerHTML = result;
                        }
                    });
                } else if (attrName.startsWith('wiy:data')) {
                    let bindAttrName = attrName.startsWith('wiy:data-') ? attrName.slice(9) : undefined;
                    let eventType;
                    switch (node.nodeName) {
                        case 'INPUT':
                            switch (node.getAttribute('type')) {
                                case 'checkbox':
                                case 'radio':
                                    bindAttrName ||= 'checked';
                                    eventType = 'change';
                                    break;
                                default:
                                    bindAttrName ||= 'value';
                                    eventType = 'change';
                                    break;
                            }
                            break;
                        case 'TEXTAREA':
                        case 'SELECT':
                            bindAttrName ||= 'value';
                            eventType = 'change';
                            break;
                        default:
                            if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
                                eventType = 'change';
                                dataBinders[bindAttrName || ''] = async (component) => {
                                    await this.observe(() => {
                                        return this.renderValue(attrValue, extraContext);
                                    }, (result) => {
                                        component.setData(bindAttrName ? {
                                            [bindAttrName]: result,
                                        } : result);
                                    });
                                };
                                break;
                            }
                    }
                    if (bindAttrName) {
                        await this.observe(() => {
                            return this.renderValue(attrValue, extraContext);
                        }, (result) => {
                            if (typeof result == 'undefined') {
                                delete node[bindAttrName];
                            } else {
                                node[bindAttrName] = result;
                            }
                        });
                    }
                    if (eventType) {
                        const eventHandler = (e) => {
                            let newValue;
                            if (e instanceof WiyEvent) {
                                if (bindAttrName) {
                                    newValue = e.data[bindAttrName];
                                } else {
                                    newValue = e.data;
                                }
                            } else {
                                newValue = node[bindAttrName];
                            }
                            this.renderValue(`${attrValue}=__newValue__`, {
                                ...extraContext,
                                __newValue__: newValue,
                            });
                        };
                        node.addEventListener(eventType, eventHandler);
                        listeners[eventType] = [
                            ...(listeners[eventType] || []),
                            eventHandler,
                        ];
                    }
                }
            }
        }

        if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
            await this.renderComponent(node, extraContext, listeners, dataBinders);
        } else {
            if (node.nodeName == 'SLOT') {
                await this.renderSlot(node, extraContext);
            } else {
                await this.renderChildNodes(node, extraContext);
            }
        }
    }

    async renderSlot(node, extraContext) {
        const slotName = node.name || '';
        let slotRenderer = this._config.slotRenderers[slotName];
        if (!slotRenderer) {
            slotRenderer = async () => {
                await this.renderChildNodes(node, extraContext);
                return nodesToDocumentFragment(node.childNodes);
            };
        }
        const slotContents = await slotRenderer();
        node.replaceWith(slotContents);
    }

    async renderIf(node, extraContext) {
        const condition = removeAttr(node, 'wiy:if');

        const pointer = document.createComment('');
        node.replaceWith(pointer);
        let prevNode;
        await this.observe(() => {
            return this.renderValue(condition, extraContext);
        }, async (result) => {
            if (!result) {//不需要展示
                prevNode && prevNode.remove();
                return;
            }

            if (prevNode) {//已经渲染过
                if (pointer.nextElementSibling != prevNode) {//不在dom中
                    insertNodeAfter(prevNode, pointer);
                }
                return;
            }

            const copyNode = node.cloneNode(true);
            await this.renderNode(copyNode, extraContext);
            insertNodeAfter(copyNode, pointer);
            prevNode = copyNode;
        });
    }

    async renderFor(node, extraContext) {
        const forObj = removeAttr(node, 'wiy:for');
        const keyName = removeAttr(node, 'wiy:for.key') || 'key';
        const valueName = removeAttr(node, 'wiy:for.value') || 'value';

        const pointer = document.createComment('');
        node.replaceWith(pointer);
        let prevMap = {};
        await this.observe(() => {
            const obj = this.renderValue(forObj, extraContext);
            Object.keys(obj);//这一行是为了观察obj中keys的变化，这样的话当keys变化时才能被通知
            return obj;
        }, async (result) => {
            const map = {};
            let currentPointer = pointer;
            for (let [key, value] of Object.entries(result)) {
                const prevData = prevMap[key];
                const {
                    value: prevValue,
                    node: prevNode,
                } = prevData || {};
                if (prevData && value == prevValue) {
                    map[key] = prevData;
                    currentPointer = prevNode;
                    continue;
                }

                let temp = prevNode || document.createComment('');
                !prevNode && insertNodeAfter(temp, currentPointer);
                await this.observe(() => {
                    return result[key];//这一行是为了观察obj中该key对应的value的变化，这样的话当该key对应的value变化时才能被通知
                }, async (value) => {
                    const copyNode = node.cloneNode(true);
                    await this.renderNode(copyNode, {
                        ...extraContext,
                        [keyName]: key,
                        [valueName]: value,
                    });
                    temp.replaceWith(copyNode);
                    temp = copyNode;
                    map[key] = {
                        value,
                        node: copyNode,
                    };
                });
                currentPointer = temp;
            }
            prevMap = map;
        });
    }

    async renderChildNodes(node, extraContext) {
        for (let childNode of node.childNodes) {
            await this.renderNode(childNode, extraContext);
        }
    }

    async renderComponent(node, extraContext, listeners, dataBinders) {
        if (node.wiyComponent) {
            return;
        }

        const slotRenderers = {};
        for (let childNode of node.childNodes) {
            if (childNode.nodeName == 'TEMPLATE') {
                childNode.remove();
                const slotName = childNode.getAttribute('wiy:slot') || '';
                slotRenderers[slotName] = async () => {
                    await this.renderNode(childNode.content, extraContext);
                    return nodesToDocumentFragment(childNode.content.childNodes);
                };
            }
        }
        slotRenderers[''] = async () => {
            await this.renderChildNodes(node, extraContext);
            return nodesToDocumentFragment(node.childNodes);
        };

        return new Promise(async (resolve) => {
            const define = await loadComponentDefine(this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]);
            const config = {
                attrs: getElementAttrs(node),
                listeners,
                dataBinders,
                slotRenderers,
                app: this._config.app,
            };
            const component = new Component({
                ...define,
                ...config,
            });
            component.addEventListener('init', async () => {
                await component.mount(node);
                resolve(component);
            });
        });
    }

    renderString(template, extraContext) {
        return renderHtmlInScope(template.replaceAll('{{', '${').replaceAll('}}', '}'), {
            ...this._config.context,
            ...extraContext,
        });
    }

    renderValue(expression, extraContext) {
        return renderValueInScope(expression, {
            ...this._config.context,
            ...extraContext,
        });
    }
}

class Page extends Component {
    constructor(config = {}) {
        super(config);
    }
}

class App extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _uuid: {
                value: uuid(),
            },
            _config: {
                value: config,
            },
            _pageCache: {
                value: {},
            },
            _router: {
                value: new Router(),
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new Event('init'));
        });
    }

    async init() {
        this._config.components ||= {};

        Object.entries(this._config.components).forEach(([name, value]) => {
            this._config.components[name.toUpperCase()] = value;
        });

        const cssCode = await loadSourceString(this._config.style) || '';
        if (cssCode) {
            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = URL.createObjectURL(new Blob([cssCode], { type: 'text/css' }));
            document.head.appendChild(style);
        }

        for (let plugin of (this._config.plugins || [])) {
            const method = await loadPluginMethod(plugin);
            await method(this);
        }

        Object.entries(this._config.lifecycle || {}).forEach(([name, value]) => {
            this.addEventListener(name, this._config.lifecycle[name] = value.bind(this));
        });
        this._config.container ||= document.body;

        this._router.addEventListener('change', e => {
            if (e.data.path) {
                this.renderPage(e.data);
            } else {
                this._router.go(this._config.index);
            }
        });
        this._router.updateStatus();
    }

    async renderPage(info) {
        if (!this._config.pages[info.path]) {
            throw new Error(`找不到路径：${info.path}`);
        }
        return new Promise(async (resolve) => {
            const showPage = async (page) => {
                this._config.container.innerHTML = '';
                const node = document.createElement('wiy-page');
                this._config.container.appendChild(node);
                await page.mount(node);
                resolve(page);
            };

            const key = JSON.stringify(info);
            let page = this._pageCache[key];
            if (page) {
                showPage(page);
            } else {
                const define = await loadComponentDefine(this._config.pages[info.path]);
                page = new Page({
                    ...define,
                    app: this,
                });
                this._pageCache[key] = page;
                page.addEventListener('init', () => {
                    showPage(page);
                });
            }
        });
    }

    registerComponent(name, component) {
        this._config.components[name.toUpperCase()] = component;
    }
}

class Router extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _config: {
                value: config,
            },
            _base: {
                value: wiyEnv.publicPath,
                writable: true,
            },
            _current: {
                writable: true,
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new Event('init'));
        });
    }

    async init() {
        window.addEventListener('popstate', () => {
            this.updateStatus();
        });
    }

    updateStatus(change = true) {
        const base = this._base;
        const url = new URL(location);
        const path = url.pathname;

        this._current = {};
        if (path.startsWith(base)) {
            this._current.path = path.slice(base.length);
            this._current.params = url.searchParams.entries().reduce((params, [name, value]) => {
                params[name] = value;
                return params;
            }, {});
        }

        change && this.dispatchEvent(new WiyEvent('change', this._current));
    }

    go(path, params = {}) {
        const url = new URL(this._base + path, location);
        Object.entries(params).forEach(([name, value]) => {
            url.searchParams.set(name, value);
        });
        history.pushState(null, null, url);
        this.updateStatus();
    }

    back() {
        history.back();
    }

    forward() {
        history.forward();
    }
}

class WiyEvent extends Event {
    constructor(type, data) {
        super(type);
        this.data = data;
    }
}

export default {
    App,
};