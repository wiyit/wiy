# wiy哲学
- **极简**：抛弃繁琐，直达本质。
- **配置式**：让逻辑隐于配置。
- **模块化**：模板、样式、逻辑、资源，皆可自由拼装。
- **组件化**：组件职责分明，继承与复用，随心所欲。
- **响应式**：数据微动，全局共鸣。
# wiy起步
创建一个wiy项目：
```shell
npm create @wiyit/wiy
```
上面命令执行后需要设置一个项目名称，然后根据提示进行操作，直到项目创建成功。

假设项目名称为：wiy-example，当项目创建成功后，即可进行后续操作：
```shell
cd wiy-example/
npm install
npm run dev
```
以上命令执行成功后，会自动打开一个浏览器标签页，如果看到“Welcome to wiy!”字样，恭喜你！你的wiy项目启动成功了！
## 项目结构
一个wiy项目的结构通常如下：
```
/								项目根目录
┣━ public/						存放公共文件，如favicon.ico等文件，该目录下的文件不会被wiy-cli所构建
┣━ src/							存放源代码文件，该目录下的文件会被wiy-cli所构建
┃	┣━ assets/					存放公共资源文件，包括公共的模板、样式、字体、图片、音频、视频、svg、json等各种资源
┃	┣━ components/				存放组件相关文件，该目录下的组件可根据具体情况再划分不同层级的目录
┃	┃	┣━ component1/			存放某个组件的相关文件
┃	┃	┃	┣━ assets/			存放该组件内部用到的资源文件，包括字体、图片、音频、视频、svg、json等各种资源
┃	┃	┃	┣━ component1.css	该组件的样式文件
┃	┃	┃	┣━ component1.html	该组件的模板文件
┃	┃	┃	┗━ component1.js	该组件的逻辑文件，也是该组件的入口文件
┃	┃	┗━ ...					其他组件……
┃	┣━ pages/					存放页面组件相关文件，该目录下的结构与components相似
┃	┗━ app.js					应用文件，也是该项目的入口文件
┣━ package.json					Node.js的项目配置文件
┗━ wiy.config.*.js				wiy配置文件，可根据具体情况划分不同的配置文件，如dev、test、prod等
```
# wiy概念
在wiy的世界中，`应用（app）`是由一系列`组件（component）`组合而成的，而`组件`又是由一系列`模块（module）`拼装而成的。
## 应用 app
定义了以下内容：
- 应用引用的页面组件
- 应用首页
- 应用生命周期

一个应用的示例如下（app.js）：
```javascript
import wiy from '@wiyit/wiy';

new wiy.App({
    pages: {//该应用引用的页面组件，key是页面访问路径，value是动态导入的页面组件
        'page/first': import('./pages/page1/page1.js'),
        'page/second': import('./pages/page2/page2.js'),
    },
    index: 'page/first',//应用首页访问路径
    lifecycle: {//各个生命周期函数
        init() {
            console.log('应用初始化成功');
        },
    },
});
```
## 组件 component
定义了以下内容：
- 组件模板
- 组件样式
- 组件引用的其他组件
- 组件数据
- 组件方法
- 组件生命周期

一个组件的示例如下（例如component1.js）：
```javascript
export default {
    template: import('./component1.html'),//动态导入的模板
    style: import('./component1.css'),//动态导入的样式
    components: {//该组件引用的其他组件，key是使用该组件时所用的标签名称，value是动态导入的组件
        Component2: import('../component2/component2.js'),
        Component3: import('../component3/component3.js'),
    },
    data: {//组件的所有数据
        currentTime: new Date(),
    },
    methods: {//组件的所有方法
        updateTime() {
            this.currentTime = new Date();
        },
    },
    lifecycle: {//各个生命周期函数
        init() {
            setInterval(() => {
                this.updateTime();
            }, 1000);
        },
    },
};
```
## 模块 module
模块是组件中会用到的各种资源，包括模板、样式、字体、图片、音频、视频、svg、json等各种资源。模块有以下几种使用方式：
- 在组件中使用。支持使用模板、样式、json等模块，例如在component1.js中：
  ```javascript
  export default {
      template: import('./component1.html'),//使用模板
      style: import('./component1.css'),//使用样式
      methods: {
          async loadJson() {
              const module = await import('./assets/info.json');//使用json
              console.log(module.default);
          },
      },
  };
  ```
- 在模板中使用。支持使用图片、音频、视频、svg等模块，例如在component1.html中：
  ```html
  <!-- 使用图片 -->
  <img src="./assets/image.png" />
  <!-- 使用svg -->
  <img src="./assets/loading.svg" />
  <!-- 使用音频 -->
  <audio src="./assets/audio.wav"></audio>
  <!-- 使用视频 -->
  <video src="./assets/video.mp4"></video>
  ```
- 在样式中使用，支持使用样式、字体、图片、svg等模块，例如在component1.css中：
  ```css
  /* 使用样式 */
  @import url('../../assets/common.css');

  @font-face {
      font-family: 'font-name';
      /* 使用字体 */
      src: url('../../assets/font.woff');
  }

  div {
      /* 使用图片 */
      background-image: url('./assets/image.png');
  }

  .loading {
      /* 使用svg */
      background-image: url('./assets/loading.svg');
  }
  ```
# wiy能力
## 模板渲染
支持mustache语法模板渲染，支持text节点内容、属性节点内容的渲染。通过双大括号将表达式的值渲染到html中。

提供html：
```html
<div id="{{this.objId}}">{{this.objName}}</div>
```
提供js：
```javascript
export default {
    data: {
        objId: 23,
        objName: '🌏',
    },
}
```
你将得到：
```html
<div id="23">🌏</div>
```
## 条件渲染 wiy:if
支持根据一个条件表达式控制是否渲染。

提供html：
```html
<div wiy:if="this.objId1 < 23">{{this.objName1}}</div>
<div wiy:if="this.objId2 < 23">{{this.objName2}}</div>
```
提供js：
```javascript
export default {
    data: {
        objId1: 22,
        objName1: '🌞',
        objId2: 24,
        objName2: '🌛',
    },
}
```
你将得到：
```html
<div>🌞</div>
```
## 列表渲染 wiy:for
支持根据一个表达式的项目来渲染多项内容。wiy:for支持数组、对象，另外还可通过wiy:for.key和wiy:for.value来自定义key和value的变量名。

提供html：
```html
<div wiy:for="this.objList" wiy:for.key="k" wiy:for.value="v">{{k}}: {{v}}</div>
<br>
<div wiy:for="this.objMap">{{key}}: {{value}}</div>
```
提供js：
```javascript
export default {
    data: {
        objList: ['🌌', '🌞', '🌏', '🌛', '🪐', '🌟', '🌠'],
        objMap: {
            a: '🌌',
            b: '🌞',
            c: '🌏',
            d: '🌛',
            e: '🪐',
            f: '🌟',
            g: '🌠',
        },
    },
}
```
你将得到：
```html
<div>0: 🌌</div>
<div>1: 🌞</div>
<div>2: 🌏</div>
<div>3: 🌛</div>
<div>4: 🪐</div>
<div>5: 🌟</div>
<div>6: 🌠</div>
<br>
<div>a: 🌌</div>
<div>b: 🌞</div>
<div>c: 🌏</div>
<div>d: 🌛</div>
<div>e: 🪐</div>
<div>f: 🌟</div>
<div>g: 🌠</div>
```
## 事件绑定 wiy:onxxxx
支持给标签绑定事件。wiy:on后紧跟事件类型，不区分大小写。支持原生事件及组件自定义事件，支持内联表达式或函数引用。

提供html：
```html
<button wiy:onclick="this.currentObjIndex = (this.currentObjIndex + 1) % this.objList.length">
    {{this.objList[this.currentObjIndex]}}
</button>
<button wiy:onclick="this.onButtonClick">
    {{this.objList[this.currentObjIndex]}}
</button>
```
提供js：
```javascript
export default {
    data: {
        objList: ['🌌', '🌞', '🌏', '🌛', '🪐', '🌟', '🌠'],
        currentObjIndex: 0,
    },
    methods: {
        onButtonClick() {
            this.currentObjIndex = (this.currentObjIndex + 1) % this.objList.length
        },
    },
};          
```
你将得到两个按钮，点击任何一个按钮，都会在按钮上轮流展示各个天体：

![image](https://github.com/user-attachments/assets/34867787-9713-4fc2-8e1a-17c97598e948)
## 数据绑定 wiy:data
支持给标签绑定数据。支持原生表单标签（input、textarea、select）及自定义组件，数据为双向绑定。

提供html：
```html
<input wiy:data="this.a1" type="checkbox" />{{this.a1}}
<button wiy:onclick="this.a1 =! this.a1">点我</button>
<hr>
<input wiy:data="this.a2" type="radio" />{{this.a2}}
<button wiy:onclick="this.a2 =! this.a2">点我</button>
<hr>
<input wiy:data="this.a3" type="text" />{{this.a3}}
<button wiy:onclick="this.a3 += '🌏'">点我</button>
<hr>
<textarea wiy:data="this.a4"></textarea>
<pre>{{this.a4}}</pre>
<button wiy:onclick="this.a4 += '🌏'">点我</button>
<hr>
<select wiy:data="this.a5">
    <option value="">请选择：</option>
    <option value="1">一</option>
    <option value="2">二</option>
    <option value="3">三</option>
</select>{{this.a5}}
<button wiy:onclick="this.a5 = this.a5 % 3 + 1">点我</button>
```
提供js：
```javascript
export default {
    data: {
        a1: false,
        a2: true,
        a3: '🌞',
        a4: '🌏\n🌛\n🪐\n🌟',
        a5: 2,
    },
};          
```
你将得到多个表单标签，其数据实现了双向绑定：

![image](https://github.com/user-attachments/assets/ff0372c5-ef47-48e8-8e93-36b1616f47a8)
## 响应式更新
## 数据观察器
## 事件机制
支持事件机制。在逻辑中使用this.on、this.off、this.trigger函数即可实现事件的监听及触发。

提供js：
```javascript
export default {
    methods: {
        foo() {
            // 监听事件
            this.on('customevent', (e) => {
                console.log('got event', e);            
            });
            // 停止监听事件
            this.off('customevent');
        },
        bar() {
            // 触发事件，并传递数据
            this.trigger('customevent', {
                a: 22,
                b: 23,           
            });
        },
    }
}
```
## 模板管理
支持引入模板。只需要在逻辑中配置模板文件的引入路径，即可使用该模板进行渲染。需要使用wiy-cli构建项目。

提供js：
```javascript
export default {
    template: import('./template.html'),
}
```
## 样式管理
支持引入样式。只需要在逻辑中配置样式文件的引入路径，即可将样式应用于模板。需要使用wiy-cli构建项目。

提供js：
```javascript
export default {
    style: import('./style.css'),
}
```
## 组件生命周期
## 组件继承
## 路由
## 插件

