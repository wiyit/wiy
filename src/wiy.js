import _ from 'lodash';

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
    node.nextSibling ? insertNodeBefore(nodeToInsert, node.nextSibling) : node.parentNode ? node.parentNode.appendChild(nodeToInsert) : void 0;
};
const loadComponentDefine = async (component) => {
    //component应该是一个组件的定义对象，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个组件的定义对象
    if (component instanceof Promise) {
        component = (await component).default;
    }
    if (!component._uuid) {
        component._uuid = _.uniqueId('component-define-');
    }
    return _.cloneDeep(component);//将组件定义进行深拷贝，使组件间数据隔离
};
const loadSourceString = async (source) => {
    //source应该是一个字符串，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个字符串
    return source instanceof Promise ? (await source).default : source;
};
const loadPluginDefine = async (plugin) => {
    //plugin应该是一个插件的定义对象，或者一个import()语句返回的Promise，Promise返回的是一个Module，里面的default应该是Module导出的默认内容，应该是一个插件的定义对象
    return plugin instanceof Promise ? (await plugin).default : plugin;
};




class Queue {
    constructor() {
        Object.defineProperties(this, {
            _items: {
                value: [],
            },
        });
    }

    enqueue(element) {
        this._items.push(element);
    }

    dequeue() {
        return this._items.shift();
    }

    peek() {
        return this._items[0];
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() == 0;
    }
}
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
        return this._items[this.size() - 1];
    }

    size() {
        return this._items.length;
    }

    isEmpty() {
        return this.size() == 0;
    }

    forEach(callback) {
        this._items.forEach(callback);
    }
}
class ObserverManager {
    constructor() {
        Object.defineProperties(this, {
            _map: {
                value: {},
            },
            _queue: {
                value: new Queue(),
            },
            _stack: {
                value: new Stack(),
            },
            _symbolForTargetSelf: {
                value: Symbol(),
            },
        });

        const update = async () => {
            while (!this._queue.isEmpty()) {
                await this._queue.dequeue()();
            }
            window.requestAnimationFrame(update);
        };
        window.requestAnimationFrame(update);
    }

    push(observer) {
        this._stack.push(observer);
    }

    pop() {
        this._stack.pop();
    }

    /**
     * @param {*} target 
     * @param {*} prop  当观察者观察的是target本身，而不是target下的具体某个属性时，不需要传prop
     */
    observe(target, prop = this._symbolForTargetSelf) {
        if (this._stack.isEmpty()) {
            return;
        }
        const temp = this._map[target._proxyUuid] = this._map[target._proxyUuid] || {};
        const observers = temp[prop] = temp[prop] || new Set();//需要注意内存泄漏
        this._stack.forEach(observer => {
            observers.add(observer);
        });
    }

    notify(target, prop, propsChanged) {
        const temp = this._map[target._proxyUuid] || {};
        const observers = new Set();
        //该属性的观察者
        temp[prop] && temp[prop].forEach(observer => {
            observers.add(observer);
        });
        if (propsChanged) {
            //该属性所属对象本身的观察者
            temp[this._symbolForTargetSelf] && temp[this._symbolForTargetSelf].forEach(observer => {
                observers.add(observer);
            });
        }

        //添加到处理队列中
        observers.forEach(observer => {
            this._queue.enqueue(async () => {
                await observer.process();
            });
        });
    }

    stop(component) {
        Object.values(this._map).forEach(temp => {
            Object.values(temp).forEach(observers => {
                observers.forEach(observer => {
                    if (observer.getComponent() == component) {
                        observers.delete(observer);
                    }
                });
            });
        });
    }
}
class Observer {
    constructor(callback, info, component) {
        Object.defineProperties(this, {
            _uuid: {
                value: _.uniqueId('observer-'),
            },
            _callback: {
                value: callback,
            },
            _info: {
                value: info,
            },
            _component: {
                value: component,
            },
        });
    }

    async process() {
        await this._callback();
    }

    getComponent() {
        return this._component;
    }
}
const isProxyObj = (obj) => {
    return typeof obj == 'object' && !!obj._proxyUuid;
};
const tryCreateProxy = (obj) => {
    if (typeof obj != 'object' || isProxyObj(obj) || obj instanceof Date || obj instanceof Node) {
        return obj;
    }
    Object.defineProperties(obj, {
        _proxyUuid: {
            value: _.uniqueId('proxy-'),
        },
    });
    const proxyObj = new Proxy(obj, {
        has(target, prop) {
            const has = Reflect.has(target, prop);
            const propDesc = Reflect.getOwnPropertyDescriptor(target, prop);
            if (!has || (propDesc && propDesc.writable)) {
                OBSERVER_MANAGER.observe(target, prop);
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
                OBSERVER_MANAGER.observe(target, prop);
            }
            return value;
        },
        ownKeys(target) {
            const result = Reflect.ownKeys(target);
            OBSERVER_MANAGER.observe(target);
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
    return proxyObj;
};
const OBSERVER_MANAGER = new ObserverManager();



const unmount = (obj) => {
    if (obj instanceof Node) {
        switch (obj.nodeType) {
            case Node.DOCUMENT_FRAGMENT_NODE:
                obj.childNodes.forEach(childNode => {
                    unmount(childNode);
                });
                break;
            case Node.ELEMENT_NODE:
                obj.childNodes.forEach(childNode => {
                    unmount(childNode);
                });
                if (obj._wiyComponent) {
                    obj._wiyComponent.unmount();
                }
                break;
        }
        return;
    }

    const nodeList = toNodeList(obj);
    nodeList.forEach(node => {
        unmount(node);
    });
};
const replaceWith = (node, obj) => {
    unmount(node);
    if (obj instanceof Node) {
        node.replaceWith(obj);
    } else {
        node.replaceWith(nodesToDocumentFragment(toNodeList(obj)));
    }
};
const insertAfter = (node, obj) => {
    const temp = document.createComment('');
    insertNodeAfter(temp, node);
    replaceWith(temp, obj);
};
const remove = (obj) => {
    unmount(obj);
    if (obj instanceof Node) {
        obj.remove();
    } else {
        nodesToDocumentFragment(toNodeList(obj));
    }
};
const toNodeList = (obj) => {
    if (obj instanceof Node) {
        return [obj];
    } else {
        const list = [];
        for (let item of obj) {
            if (typeof item == 'undefined') {
                continue;
            }
            for (let node of toNodeList(item)) {
                list.push(node);
            }
        }
        return list;
    }
}




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
                value: _.uniqueId('component-'),
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
            _element: {
                writable: true,
            },
        });

        this.init().then(() => {
            this.trigger('init');
        });
    }

    async init() {
        this._config.context = {
            this: this._proxyThis,
        };
        this._config.components = this._config.components || {};
        this._config.lifecycle = this._config.lifecycle || {};

        Object.entries(this._config.components).forEach(([name, value]) => {
            this._config.components[name.toUpperCase()] = value;
        });
        Object.entries(this._config.methods || {}).forEach(([name, value]) => {
            Object.defineProperty(this, name, {
                value: value.bind(this._proxyThis),
            });
        });
        Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
            value.forEach(listener => {
                this.on(name, listener);
            });
        });
        let data = this._config.data;
        if (typeof data == 'function') {
            data = data.bind(this._proxyThis)();
        }
        Object.entries(data || {}).forEach(([name, value]) => {
            this[name] = value;
        });
        for (let [name, value] of Object.entries(this._config.dataBinders || {})) {
            await value(this);
        }

        const lifecycleFunction = this._config.lifecycle.init;
        lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this._proxyThis)());
    }

    getUuid() {
        return this._uuid;
    }

    getApp() {
        return this._config.app;
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

    hasAttr(name) {
        return typeof this.attr(name) != 'undefined';
    }

    hasSlotTemplate(name = '') {
        return typeof this._config.slotRenderers[name] != 'undefined';
    }

    on(eventType, listener) {
        this._rawThis.addEventListener(eventType, listener);
    }

    trigger(eventType, data) {
        this._rawThis.dispatchEvent(new WiyEvent(eventType, data));
    }

    onEventPath(e) {
        return e.composedPath().some(node => {
            return node == this || node == this._element;
        });
    }

    getElement(id) {
        return this._element ? this._element.shadowRoot.getElementById(id) : undefined;
    }

    getComponent(id) {
        const element = this.getElement(id);
        return element ? element._wiyComponent : undefined;
    }

    addChild(component) {
        const oldParent = component._parent;
        if (oldParent) {
            oldParent.removeChild(component);
        }
        this._children.add(component);
        component._parent = this;
    }

    removeChild(component) {
        if (!this._children.has(component)) {
            throw new Error(`${component._uuid}不是${this._uuid}的子组件`);
        }
        this._children.delete(component);
        component._parent = null;
    }

    async mount(element) {
        const oldElement = this._element;
        this._element = element;
        this._element._wiyComponent = this;

        const afterMount = async () => {
            const lifecycleFunction = this._config.lifecycle.mount;
            lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this._proxyThis)());
            this.trigger('mount');
        };

        setElementAttrs(element, {
            uuid: this._uuid,
            ...this._config.attrs,
        });
        Object.entries(this._config.listeners || {}).forEach(([name, value]) => {
            element.addEventListener(name, value);
        });

        const root = element.attachShadow({ mode: 'open' });

        if (oldElement) {
            root.appendChild(oldElement.shadowRoot);
            await afterMount();
            return;
        }

        root.innerHTML = await loadSourceString(this._config.template) || '';
        await this.renderNodes(root.childNodes);

        let cssCode = await loadSourceString(this._config.style) || '';
        if (cssCode) {
            cssCode = cssCode.replaceAll(':root', ':root,:host');

            const style = document.createElement('link');
            style.rel = 'stylesheet';
            style.href = URL.createObjectURL(new Blob([cssCode], { type: 'text/css' }));
            style.onload = async () => {
                await afterMount();
            };
            root.prepend(style);
        } else {
            await afterMount();
        }
    }

    async unmount() {
        OBSERVER_MANAGER.stop(this);

        this._children.forEach(child => {
            child.unmount();
        });

        let oldElement = this._element;
        if (!oldElement) {
            return;
        }

        this._element._wiyComponent = undefined;
        this._element = undefined;

        const afterUnmount = async () => {
            const data = {
                element: oldElement,
            };
            const lifecycleFunction = this._config.lifecycle.unmount;
            lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this._proxyThis)(data));
            this.trigger('unmount', data);
        };

        await afterUnmount();
    }

    async observe(func, callback, info) {
        let firstObserve = true;
        let oldResult;
        const startObserve = async () => {
            let result;
            let needCallback = false;
            OBSERVER_MANAGER.push(observer);
            try {
                result = func();
                if (result instanceof Promise) {
                    result = await result;
                }
                if (!firstObserve && !_.isObject(result) && oldResult == result) {
                    return;
                }
                needCallback = true;
            } finally {
                OBSERVER_MANAGER.pop();
                if (needCallback) {
                    const callbackResult = await callback(result, firstObserve);
                    firstObserve = false;
                    oldResult = result;
                    return callbackResult;
                }
            }
        };
        const observer = new Observer(async () => {
            if (this._element) {
                await startObserve();
            }
        }, info, this);
        return await startObserve();
    }

    async renderTextOrAttr(node, extraContext) {
        const originNodeValue = node.nodeValue;
        await this.observe(() => {
            return this.renderString(originNodeValue, extraContext);
        }, (result) => {
            node.nodeValue = result;
        }, originNodeValue);
        return node;
    }

    async renderElement(node, extraContext) {
        if (node.hasAttribute('wiy:if')) {
            return await this.renderIf(node, extraContext);
        }
        if (node.hasAttribute('wiy:for')) {
            return await this.renderFor(node, extraContext);
        }

        const listeners = {};
        const dataBinders = {};
        let slotName;
        for (let attrNode of Array.from(node.attributes)) {//需先转成数组，防止遍历过程中删除属性导致遍历出错
            await this.renderTextOrAttr(attrNode, extraContext);
            const attrName = attrNode.nodeName;
            if (attrName.startsWith('wiy:')) {
                const attrValue = removeAttr(node, attrName);
                if (attrName.startsWith('wiy:on')) {
                    const eventType = attrName.slice(6);
                    const eventHandler = (e) => {
                        const handler = this.renderValue(attrValue, extraContext);
                        if (typeof handler == 'function') {
                            handler(e);
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
                    }, attrValue);
                } else if (attrName.startsWith('wiy:attr-')) {
                    let bindAttrName;
                    if (attrName.startsWith('wiy:attr-')) {
                        bindAttrName = attrName.slice(9);
                    }
                    if (bindAttrName) {
                        await this.observe(() => {
                            return this.renderValue(attrValue, extraContext);
                        }, (result) => {
                            if (typeof result == 'undefined') {
                                node.removeAttribute(bindAttrName);
                            } else {
                                node.setAttribute(bindAttrName, result);
                            }
                        }, attrValue);
                    }
                } else if (attrName.startsWith('wiy:data')) {
                    let bindAttrName;
                    if (attrName.startsWith('wiy:data-')) {
                        bindAttrName = attrName.slice(9);
                    } else if (attrName != 'wiy:data') {
                        continue;
                    }

                    let eventType;
                    if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
                        eventType = 'change';
                        dataBinders[bindAttrName || ''] = async (component) => {
                            await this.observe(() => {
                                const result = this.renderValue(attrValue, extraContext);
                                if (!bindAttrName && _.isObject(result)) {//未绑定具体属性时，实际则需要观察对象中的所有属性的变化
                                    if (!isProxyObj(result)) {
                                        console.warn(`${attrValue}的值不是响应式对象，可能无法观察其属性变化`);
                                    }
                                    Object.entries(result);
                                }
                                return result;
                            }, (result) => {
                                component.setData(bindAttrName ? {
                                    [bindAttrName]: result,
                                } : result);
                            }, attrValue);
                        };
                    } else {
                        switch (node.nodeName) {
                            case 'INPUT':
                                switch (node.getAttribute('type')) {
                                    case 'checkbox':
                                    case 'radio':
                                        bindAttrName = bindAttrName || 'checked';
                                        eventType = 'change';
                                        break;
                                    default:
                                        bindAttrName = bindAttrName || 'value';
                                        eventType = 'change';
                                        break;
                                }
                                break;
                            case 'TEXTAREA':
                            case 'SELECT':
                                bindAttrName = bindAttrName || 'value';
                                eventType = 'change';
                                break;
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
                            }, attrValue);
                        }
                    }

                    if (eventType) {
                        const eventHandler = (e) => {
                            let newData;
                            if (e instanceof WiyEvent) {
                                newData = e.data;
                            } else {
                                newData = node;
                            }
                            if (bindAttrName) {
                                if (bindAttrName in newData) {
                                    this.renderValue(`${attrValue}=__newValue__`, {
                                        ...extraContext,
                                        __newValue__: newData[bindAttrName],
                                    });
                                }
                            } else {
                                Object.entries(newData).forEach(([key, value]) => {
                                    this.renderValue(`${attrValue}['${key}']=__newValue__`, {
                                        ...extraContext,
                                        __newValue__: value,
                                    });
                                });
                            }
                        };
                        node.addEventListener(eventType, eventHandler);
                        listeners[eventType] = [
                            ...(listeners[eventType] || []),
                            eventHandler,
                        ];
                        listeners['datainit'] = [
                            ...(listeners['datainit'] || []),
                            eventHandler,
                        ];
                    }
                } else if (attrName == 'wiy:slot') {
                    slotName = attrValue;
                }
            }
        }

        if (this._config.components[node.nodeName] || this._config.app._config.components[node.nodeName]) {
            return await this.renderComponent(node, extraContext, listeners, dataBinders);
        } else {
            if (node.nodeName == 'SLOT') {
                return await this.renderSlot(node, extraContext);
            } else if (node.nodeName == 'TEMPLATE') {
                if (typeof slotName != 'undefined') {
                    node._wiyTemplate = {
                        slot: slotName,
                        context: {
                            ...this._config.context,
                            ...extraContext,
                        },
                    };
                    return node;
                } else {
                    return await this.renderNodes(node.content.childNodes, extraContext);
                }
            } else {
                await this.renderNodes(node.childNodes, extraContext);
                return node;
            }
        }
    }

    async renderSlot(node, extraContext) {
        const slotName = node.name || '';
        let slotRenderer = this._config.slotRenderers[slotName];
        if (!slotRenderer) {
            slotRenderer = async () => {
                return await this.renderNodes(node.childNodes, extraContext);
            };
        }
        const slotContents = await slotRenderer();
        replaceWith(node, slotContents);
        return slotContents;
    }

    async renderIf(node, extraContext) {
        const list = [];

        const condition = removeAttr(node, 'wiy:if');

        const pointer = document.createComment('if');//指示if块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        await this.observe(() => {
            return !!this.renderValue(condition, extraContext);
        }, async (result) => {
            if (list[1]) {//在if块中
                remove(list[1]);//移除旧内容
            }

            if (result) {//需要渲染
                const content = await this.renderElement(node.cloneNode(true), extraContext);
                insertAfter(pointer, content);
                list[1] = content;
            } else {//不需要渲染
                list[1] = undefined;
            }
        }, condition);

        return list;
    }

    async renderFor(node, extraContext) {
        const list = [];

        const forObj = removeAttr(node, 'wiy:for');
        const keyName = removeAttr(node, 'wiy:for.key') || 'key';
        const valueName = removeAttr(node, 'wiy:for.value') || 'value';

        const pointer = document.createComment('for');//指示for块的位置
        node.replaceWith(pointer);
        list.push(pointer);

        const adjustContent = (oldContent, newContent, index) => {
            const oldIndex = list.indexOf(oldContent);
            if (oldIndex == index && oldContent == newContent) {//位置没变，内容没变
                return;
            }

            if (oldContent && oldIndex >= 0) {//在for块中
                remove(oldContent);
                list[oldIndex] = undefined;
            }

            if (newContent) {
                let prevIndex = index - 1;
                while (prevIndex >= 0) {
                    const prevContent = list[prevIndex];//前一项的内容
                    if (prevContent) {
                        const nodeList = toNodeList(prevContent);
                        for (let i = nodeList.length - 1; i >= 0; i--) {//找到最后一个在dom中的节点
                            const node = nodeList[i];
                            if (node.parentNode == pointer.parentNode || node.isConnected) {//节点没有被移除
                                insertAfter(node, newContent);
                                list[index] = newContent;
                                return;
                            }
                        }
                    }
                    prevIndex--;
                }
            }
        };

        let map = {};//之前渲染好的内容map，key是数组或对象的key，value是之前该key对应的value和已渲染好的内容
        let oldObj;
        await this.observe(() => {
            const obj = this.renderValue(forObj, extraContext);
            if (_.isObject(obj)) {
                if (!isProxyObj(obj)) {
                    console.warn(`${forObj}的值不是响应式对象，可能无法观察其属性变化`);
                }
                Object.keys(obj);//这一行是为了观察obj中keys的变化，这样的话当keys变化时才能被通知
            }
            return obj;
        }, async (result) => {
            const isArray = Array.isArray(result);
            let i = 0;
            for (let [key, value] of Object.entries(result)) {
                i++;
                let index = i;
                if (isArray) {
                    key = parseInt(key);
                }

                let oldData = map[key];
                if (oldData && (result == oldObj || value == oldData.value)) {//有之前渲染好的内容
                    const oldContent = oldData.content;
                    adjustContent(oldContent, oldContent, index);//只需要调节内容位置
                    continue;
                }

                await this.observe(() => {
                    return result[key];//这一行是为了观察obj中该key对应的value的变化，这样的话当该key对应的value变化时才能被通知
                }, async (value) => {
                    if (!(key in result)) {//key被移除
                        return;
                    }

                    if (oldData && oldData.value == value) {//key对应的value没有发生变化
                        return;
                    }

                    const content = await this.renderElement(node.cloneNode(true), {
                        ...extraContext,
                        [keyName]: key,
                        [valueName]: value,
                    });

                    const oldContent = oldData ? oldData.content : undefined;
                    adjustContent(oldContent, content, index);//更新内容

                    const data = oldData || {};
                    data.value = value;
                    data.content = content;
                    oldData = map[key] = data;
                }, `${forObj}[${key}]`);
            }
            while (i < list.length - 1) {//后续index上原有的内容需要清除
                i++;
                adjustContent(list[i]);//清除内容
            }

            oldObj = result;
        }, forObj);

        return list;
    }

    async renderNodes(nodes, extraContext) {
        const list = [];
        for (let node of Array.from(nodes)) {
            let content = node;
            switch (node.nodeType) {
                case Node.TEXT_NODE:
                    content = await this.renderTextOrAttr(node, extraContext);
                    break;
                case Node.ELEMENT_NODE:
                    content = await this.renderElement(node, extraContext);
                    break;
            }
            list.push(content);
        }
        return list;
    }

    async renderComponent(node, extraContext, listeners, dataBinders) {
        const slotRenderers = {};
        for (let childNode of Array.from(node.childNodes)) {
            if (childNode.nodeName == 'TEMPLATE') {
                childNode.remove();
                const content = await this.renderElement(childNode, extraContext);
                const templates = toNodeList(content).filter(node => {
                    return node.nodeName == 'TEMPLATE';
                });
                templates.forEach(template => {
                    const {
                        slot,
                        context,
                    } = template._wiyTemplate;
                    if (template.content.childNodes.length > 0) {
                        slotRenderers[slot] = async () => {
                            return await this.renderElement(template.cloneNode(true), context);
                        };
                    }
                });
            }
        }
        if (node.childNodes.length > 0) {
            const templateFragment = nodesToDocumentFragment(node.childNodes);
            slotRenderers[''] = async () => {
                return await this.renderNodes(templateFragment.cloneNode(true).childNodes, extraContext);
            };
        }

        await new Promise(async (resolve) => {
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
            this.addChild(component);
            component.on('init', async () => {
                node.style.visibility = 'hidden';
                component.on('mount', () => {
                    node.style.visibility = '';
                });

                await component.mount(node);
                resolve(component);
            });
        });

        return node;
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
                value: _.uniqueId('app-'),
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
            _eventBus: {
                value: new EventBus(),
            },
            _storage: {
                value: new Storage(),
            },
        });

        this.init().then(() => {
            this._router.updateStatus();
            this.dispatchEvent(new WiyEvent('init'));
        });
    }

    async init() {
        this._config.components = this._config.components || {};
        this._config.lifecycle = this._config.lifecycle || {};
        this._config.container = this._config.container || document.body;

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
            const define = await loadPluginDefine(plugin);
            await define.install(this);
        }

        this._router.addEventListener('change', e => {
            if (e.data.path) {
                this.renderPage(e.data);
            } else {
                this._router.go(this._config.index);
            }
        });
        this._router.updateStatus(false);

        const lifecycleFunction = this._config.lifecycle.init;
        lifecycleFunction && await Promise.resolve(lifecycleFunction.bind(this)());
    }

    getRouter() {
        return this._router;
    }

    getEventBus() {
        return this._eventBus;
    }

    getStorage() {
        return this._storage;
    }

    async renderPage(info) {
        await new Promise(async (resolve) => {
            const showPage = async (page) => {
                this._config.container.innerHTML = '';
                const node = document.createElement('wiy-page');
                this._config.container.appendChild(node);
                await page.mount(node);
                resolve(page);
            };

            const define = await loadComponentDefine(this._config.pages[info.path] || this._config.pages[this._config.index]);
            let page = this._pageCache[define._uuid];
            if (page) {
                showPage(page);
            } else {
                page = new Page({
                    ...define,
                    app: this,
                });
                this._pageCache[define._uuid] = page;
                page.on('init', () => {
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
            },
            _current: {
                value: tryCreateProxy({}),
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new WiyEvent('init'));
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
        const path = url.pathname.replaceAll(/\/{2,}/g, '/');

        if (path.startsWith(base)) {
            this._current.path = path.slice(base.length);
            const urlParams = Array.from(url.searchParams.entries());//兼容性问题：firefox中URL.searchParams.entries()无reduce方法
            this._current.params = urlParams.reduce((params, [name, value]) => {
                params[name] = value;
                return params;
            }, {});
        }

        change && this.dispatchEvent(new WiyEvent('change', this._current));
    }

    getCurrent() {
        return this._current;
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

class EventBus extends EventTarget {
    on(eventType, listener, target = this) {
        target.addEventListener(eventType, listener);
    }

    trigger(eventType, data, target = this) {
        target.dispatchEvent(new WiyEvent(eventType, data));
    }
}

class Storage extends EventTarget {
    constructor(config = {}) {
        super();
        Object.defineProperties(this, {
            _config: {
                value: config,
            },
            _current: {
                value: tryCreateProxy({}),
            },
        });

        this.init().then(() => {
            this.dispatchEvent(new WiyEvent('init'));
        });
    }

    async init() {
    }

    getCurrent() {
        return this._current;
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