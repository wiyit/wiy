# wiy定位
wiy是一款极简主义的前端开发框架，目的只有一个：让前端开发简单点、再简单点。
# wiy哲学
1. **极简**：抛弃繁琐，直达本质。
2. **配置式**：让逻辑隐于配置。
3. **模块化**：模板、样式、逻辑、资源，皆可自由拼装。
4. **组件化**：组件职责分明，继承与复用，随心所欲。
5. **响应式**：数据微动，全局共鸣。
# wiy起步
wiy遵从极简、配置式的思想，因此你可以通过很简单的方式，进行简单配置，即可启动一个wiy项目。
## 项目创建
需要提前安装好Node.js，然后使用以下命令创建一个wiy项目：
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
/                               项目根目录
|-- public/                     存放公共文件，如favicon.ico等文件，该目录下的文件不会被wiy-cli所构建
|-- src/                        存放源代码文件，该目录下的文件会被wiy-cli所构建
|   |-- assets/                 存放公共资源文件，包括公共的模板、样式、字体、图片、音频、视频、svg、json等各种资源
|   |-- components/             存放组件相关文件，该目录下的组件可根据具体情况再划分不同层级的目录
|   |   |-- component1/         存放某个组件的相关文件
|   |   |   |-- assets/         存放该组件内部用到的资源文件，包括字体、图片、音频、视频、svg、json等各种资源
|   |   |   |-- component1.css  该组件的样式文件
|   |   |   |-- component1.html 该组件的模板文件
|   |   |   |-- component1.js   该组件的逻辑文件，也是该组件的入口文件
|   |   |-- others...           其他组件……
|   |-- pages/                  存放页面组件相关文件，该目录下的结构与components相似
|   |-- app.js                  应用文件，也是该项目的入口文件
|-- package.json                Node.js的项目配置文件
|-- wiy.config.*.js             wiy配置文件，可根据具体情况划分不同的配置文件，如dev、test、prod等
```
## 项目配置
在wiy项目中，可根据具体情况划分不同的配置文件，一个配置文件的示例如下（例如wiy.config.dev.js）：
```javascript
module.exports = {
    //env用于定义环境变量
    env: {
        //WIY是wiy保留的环境变量
        WIY: {
            DEV: true,//是否以开发模式构建项目，并启动开发服务器。默认为false
            PUBLIC_PATH: '/customPath/',//项目部署后的路径，当项目需要部署到网站的子路径下时，可使用该配置。默认为/
            BUILD_DIST: 'dist/dev',//项目构建到本地的目录。默认为dist
        },
        //以下是自定义环境变量
        CUSTOM_PROPERTY_1: '',//支持任何类型的js属性值
        CUSTOM_PROPERTY_2: {//支持多层级，即对象嵌套
            A: '',
            B: '',
        },
    },
    //以下是自定义的webpack配置，可用来覆盖默认配置
    entry: {
        app: './src/app.js',
    },
    output: {
        filename: '[hash].bundle.js',
        clean: true,
    },
};
```
wiy采用这样的配置文件来配置项目所用到的环境变量及构建配置。
- **环境变量**：wiy支持多层级、任何类型的环境变量。在项目中访问环境变量的方式为：`process.env.${环境变量的路径}`，例如`process.env.CUSTOM_PROPERTY_2.A`可访问到`CUSTOM_PROPERTY_2`中的`A`属性的值。
- **构建配置**：wiy默认使用wiy-cli来构建项目，而wiy-cli基于webpack实现，包含默认的构建配置。因此大部分情况下，你只需要使用env属性来定义环境变量即可，除非有必要，才需要自定义的webpack配置。
## 项目运行
有了配置文件，即可在命令行中使用wiy命令来运行或构建项目：
```shell
wiy --config wiy.config.dev.js
```
- 当环境变量`WIY.DEV`为`true`时，该命令会以开发模式构建项目，并启动开发服务器，然后自动打开一个浏览器标签页运行项目，此后对代码进行任何编辑，都会在浏览器中自动刷新。
- 当环境变量`WIY.DEV`为`false`时，该命令仅会以生产模式构建项目，并自动对构建后的产物进行优化（如代码合并、压缩、tree shaking等），构建产物所在目录由环境变量`WIY.BUILD_DIST`指定。

也可将以上命令配置在package.json的`scripts`中，例如：
```json
{
  "scripts": {
    "dev": "wiy --config wiy.config.dev.js",
    "build-test": "wiy --config wiy.config.test.js",
    "build-prod": "wiy --config wiy.config.prod.js"
  }
}
```
即可直接通过`npm run dev`或`npm run build-test`等来运行或构建项目。
# wiy概念
在wiy的世界中，一个项目就是一个`应用（app）`，`应用`是由一系列`组件（component）`组合而成的，而`组件`又是由一系列`模块（module）`拼装而成的。
## 应用 app
定义了以下内容：
- 应用引用的页面组件
- 应用首页
- 应用使用的插件
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
    plugins: [//该应用使用的插件列表
        import('@wiyit/wiy-ui'),
        import('other-custom-plugin'),
    ],
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
对应的模板示例如下（component1.html）：
```html
<div>Current Time: {{this.currentTime}}</div>
<!-- 使用自定义组件Component2： -->
<Component2></Component2>
<!-- 使用自定义组件Component3： -->
<Component3></Component3>
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
              return module.default;
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
wiy提供全面的支持，以便开发者使用各种能力来开发前端项目。
## 文本渲染
支持mustache语法模板渲染，支持text节点内容、属性节点内容的渲染。通过双大括号将表达式的值以`文本形式`渲染到html中。

组件模板示例：
```html
<div id="{{this.objId}}">{{this.objName}}</div>
```
组件逻辑示例：
```javascript
export default {
    data: {
        objId: 23,
        objName: '🌏',
    },
};
```
你将得到：
```html
<div id="23">🌏</div>
```
## 富文本渲染 wiy:html
支持将一个表达式的值以`富文本（html）形式`渲染到html中。

组件模板示例：
```html
<div id="{{this.objId}}">
    {{this.objName}}
    <template wiy:html="this.objInfo"></template>
</div>
```
组件逻辑示例：
```javascript
export default {
    data: {
        objId: 23,
        objName: '🌏',
        objInfo: '<span style="color: green;">是我们赖以生存的家园。</span>',
    },
};
```
你将得到：
```html
<div id="23">
    🌏
    <span style="color: green;">是我们赖以生存的家园。</span>
</div>
```
## 条件渲染 wiy:if
支持根据一个条件表达式控制是否渲染。注意：当同时使用wiy:if和wiy:for时，wiy:if的优先级高于wiy:for。

组件模板示例：
```html
<div wiy:if="this.objId1 < 23">{{this.objName1}}</div>
<div wiy:if="this.objId2 < 23">{{this.objName2}}</div>
```
组件逻辑示例：
```javascript
export default {
    data: {
        objId1: 22,
        objName1: '🌞',
        objId2: 24,
        objName2: '🌛',
    },
};
```
你将得到：
```html
<div>🌞</div>
```
## 列表渲染 wiy:for
支持根据一个表达式的项目来渲染多项内容。wiy:for支持数组、对象，另外还可通过wiy:for.key和wiy:for.value来自定义key和value的变量名。注意：当同时使用wiy:if和wiy:for时，wiy:if的优先级高于wiy:for。

组件模板示例：
```html
<div wiy:for="this.objList" wiy:for.key="k" wiy:for.value="v">{{k}}: {{v}}</div>
<br>
<div wiy:for="this.objMap">{{key}}: {{value}}</div>
```
组件逻辑示例：
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
};
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
## 事件绑定 wiy:onxxx
支持给标签绑定事件。wiy:on后紧跟事件类型，不区分大小写。支持原生事件及组件自定义事件，支持内联表达式或函数引用。

组件模板示例：
```html
<button wiy:onclick="this.currentObjIndex = (this.currentObjIndex + 1) % this.objList.length">
    {{this.objList[this.currentObjIndex]}}
</button>
<button wiy:onclick="this.onButtonClick">
    {{this.objList[this.currentObjIndex]}}
</button>
```
组件逻辑示例：
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
你将得到两个按钮，点击任何一个按钮，都会在按钮上轮流展示各个天体。
## 数据绑定 wiy:data-xxx
支持给标签绑定数据。wiy:data-后紧跟属性名称，不区分大小写。支持原生html标签及自定义组件。

组件模板示例：
```html
<input wiy:data-disabled="this.inputDisabled" type="text" />

<Component3 wiy:data-username="this.customUsername"></Component3>
```
组件逻辑示例：
```javascript
export default {
    data: {
        inputDisabled: true,
        customUsername: '🌏',
    },
};
```
你将得到一个被禁用的输入框和一个自定义组件Component3，Component3中的`username`值为`🌏`。
## 双向数据绑定 wiy:data
支持给标签绑定数据（双向）。支持原生表单标签（input、textarea、select）及自定义组件。
- 对于**原生表单标签**，wiy:data默认绑定一个属性。`input[type=checkbox]`、`input[type=radio]`的默认绑定属性为`checked`，其余标签的默认绑定属性为`value`。
- 对于**自定义组件**，wiy:data的值必须是一个对象，对象中的所有属性都会绑定到自定义组件中。当自定义组件内部的数据发生变化时，必须通过change事件将数据传出，来实现双向数据绑定。

组件模板示例：
```html
<input wiy:data="this.a1" type="checkbox" />
<input wiy:data="this.a2" type="radio" />
<input wiy:data="this.a3" type="text" />
<textarea wiy:data="this.a4"></textarea>
<select wiy:data="this.a5">
    <option value="">请选择：</option>
    <option value="1">🌞</option>
    <option value="2">🌏</option>
    <option value="3">🌛</option>
</select>

<Component3 wiy:data="this.a6"></Component3>
```
组件逻辑示例：
```javascript
export default {
    data: {
        a1: false,
        a2: true,
        a3: '🌞',
        a4: '🌏\n🌛\n🪐\n🌟',
        a5: 2,
        a6: {
            prop1: '',
            prop2: '',
        },
    },
};          
```
你将得到多个表单标签以及一个自定义组件Component3，其数据实现了双向绑定。其中，Component3中绑定了两个属性：`prop1`和`prop2`。
## 插槽 wiy:slot
支持在自定义组件中使用插槽。子组件可通过预留插槽，来允许父组件向其内部插入内容。子组件在`slot`标签上可使用`name`属性来命名，然后父组件在`template`标签上使用`wiy:slot`来与其对应。

子组件（Component3）模板示例：
```html
<div>
    <h2>My title</h2>
    <slot></slot>
    <slot name="other"></slot>
</div>
```
父组件模板示例：
```html
<Component3>
    Default slot content. 默认插槽内容。
    <template wiy:slot="other">
        Named slot content. 具名插槽内容。
    </template>
</Component3>
```
你将得到：
```html
<Component3>
    <div>
        <h2>My title</h2>
        Default slot content. 默认插槽内容。
        Named slot content. 具名插槽内容。
    </div>
</Component3>
```
## 响应式更新
支持数据响应式更新。在wiy中，当你改变了组件中的任何数据（无论是基础数据类型，还是对象、数组中的深层内容），页面上的内容都会自动响应变化，不需要手动操作dom。支持的范围包括：
- 文本渲染
- 富文本渲染 wiy:html
- 条件渲染 wiy:if
- 列表渲染 wiy:for
- 数据绑定 wiy:data-xxx
- 双向数据绑定 wiy:data
- 插槽 wiy:slot
## 数据观察器
支持自定义数据观察器。当你需要在组件中监听一些数据的变化时，可以使用this.observe函数来创建一个数据观察器。当你观察的数据发生任何变化时，都会触发你设置的回调函数。

组件逻辑示例：
```javascript
export default {
    data: {
        a: '',
        b: '',
    },
    methods: {
        foo() {
            //创建数据观察器
            this.observe(() => {
                return this.a + this.b;//这里可以是任何表达式，只要你用到的组件数据，都会被观察
            }, (result) => {//观察回调函数，每当上面的组件数据发生变化时，都会触发回调
                console.log(result);
            });
        },
    },
};
```
## 事件管理
支持事件机制。在逻辑中使用this.on、this.off、this.trigger函数即可实现事件的监听及触发。

组件逻辑示例：
```javascript
export default {
    methods: {
        foo() {
            //监听事件
            this.on('customevent', (e) => {
                console.log('got event', e);            
            });
            //停止监听事件
            this.off('customevent');
        },
        bar() {
            //触发事件，并传递数据
            this.trigger('customevent', {
                a: 22,
                b: 23,           
            });
        },
    }
};
```
## 模板管理
支持引入模板文件。只需要在逻辑中配置模板文件的引入路径，即可使用该模板进行渲染。

组件逻辑示例：
```javascript
export default {
    template: import('./template.html'),
};
```
## 样式管理
支持引入样式文件、在模板中添加`style`标签、内联`style`属性等多种方式来定义样式。样式只作用于对应组件，不会影响到其他组件。
- **引入样式文件**：最佳支持。只需要在逻辑中配置样式文件的引入路径，即可将样式应用于模板。该样式文件涉及到的所有url()及@import的资源模块及其深层引用都会被wiy-cli解析处理。

  组件逻辑示例：
  ```javascript
  export default {
      style: import('./style.css'),
  };
  ```
- **模板style标签**：基础支持。在模板中添加`style`标签，也可将样式应用于模板。支持基础的url()和@import，不支持@import的样式文件中包括深层的url()和@import。

  组件模板示例：
  ```html
  <style>
      @import url('../../assets/common.css');

      @font-face {
          font-family: 'font-name';
          src: url('../../assets/font.woff');
      }
  
      div {
          background-image: url('./assets/image.png');
      }
    
      .loading {
          background-image: url('./assets/loading.svg');
      }
  </style>
  ```
- **内联style属性**：简单支持。在其他标签的style属性中定义样式，可将样式应用于对应标签上。只支持基础属性，不支持url()和@import。

  组件模板示例：
  ```html
  <div style="background-color: red;">
  </div>
  ```
## 组件生命周期
支持组件生命周期管理。在定义组件时，通过配置生命周期函数即可实现组件在不同生命周期的行为。

组件逻辑示例：
```javascript
export default {
    lifecycle: {//各个生命周期函数
        init() {
            console.log('组件初始化完成');
        },
    },
};
```
你将在该组件初始化（即`init`生命周期）完成后看到控制台输出：组件初始化完成。
## 组件继承
支持随心所欲的组件继承。得益于wiy模块化、组件化的哲学思想，你可以任意地组合各种资源模块，来继承原有组件，然后随心所欲地修改模板、样式、逻辑，创建你自己的组件！

假设现在有一个组件A，其模板（a.html）、样式（a.css）、逻辑（a.js）分别为三个文件。其中a.js示例如下：
```javascript
export default {
    template: import('./a.html'),
    style: import('./a.css'),
    //其他配置：
};
```
你可以通过以下几种继承方式来创建你自己的组件B：
- 继承方式1（**定制样式**）。在组件B的逻辑（b.js）中引入a.js，然后覆盖其中的`style`属性：
  ```javascript
  import ComponentA from 'path-to/a.js';//引入a.js

  export default {
      ...ComponentA,
      style: import('./b.css'),//用b.css覆盖a.js中默认的a.css样式配置
  };
  ```
  如果只想覆盖组件A的部分样式，还可以在组件B的样式（b.css）中引入a.css，然后覆盖其中的部分样式：
  ```css
  /* 引入a.css */
  @import url('path-to/a.css');

  /* 覆盖其中的部分样式 */
  div {
      background-color: red;
  }
  ```
- 继承方式2（**定制模板**）。在组件B的逻辑（b.js）中引入a.js，然后覆盖其中的`template`属性：
  ```javascript
  import ComponentA from 'path-to/a.js';//引入a.js

  export default {
      ...ComponentA,
      template: import('./b.html'),//用b.html覆盖a.js中默认的a.html模板配置
  };
  ```
  通常情况下，定制模板后还需要定制样式，你可以直接结合使用。
- 继承方式3（**定制逻辑**）。在组件B的逻辑（b.js）中引入a.js，然后覆盖其中的`data`、`methods`等属性：
  ```javascript
  import ComponentA from 'path-to/a.js';//引入a.js

  export default {
      ...ComponentA,
      data: {
          ...ComponentA.data,
          //覆盖其中的部分数据：
      },
      methods: {
          ...ComponentA.methods,
          //覆盖其中的部分方法：
      },
      //也可以覆盖其他任何配置：
  };
  ```
## 路由
支持应用路由。在组件逻辑中使用`wiy.router`的`go`、`back`、`forward`等方法即可控制路由。

组件逻辑示例：
```javascript
export default {
    methods: {
        foo() {
            //跳转指定路径
            wiy.router.go('page/second', {
                //可以给页面传一些参数
            });

            //后退
            wiy.router.back();

            //前进
            wiy.router.forward();
        },
    },
};
```
## 插件
支持在应用中使用插件。在app.js的`plugins`中引入对应插件即可。

app.js：
```javascript
import wiy from '@wiyit/wiy';

new wiy.App({
    plugins: [//该应用使用的插件列表
        import('@wiyit/wiy-ui'),
        import('other-custom-plugin'),
    ],
});
```
插件必须默认导出一个函数，接收一个参数，应用会在初始化时使用当前应用的实例作为参数来调用这个函数。
## 应用生命周期
支持应用生命周期管理。在app.js的`lifecycle`下配置生命周期函数即可实现应用在不同生命周期的行为。

app.js：
```javascript
import wiy from '@wiyit/wiy';

new wiy.App({
    lifecycle: {//各个生命周期函数
        init() {
            console.log('应用初始化完成');
        },
    },
});
```
你将在该应用初始化（即`init`生命周期）完成后看到控制台输出：应用初始化完成。
# wiy生态
wiy生态中开源了前端项目工程化所需的各种技术和工具，让前端项目的开发能够更加高效便捷。
## 核心框架 wiy
wiy是wiy生态的核心，帮助开发者用极简的方式开发项目。

开源地址：[https://github.com/wiyit/wiy](https://github.com/wiyit/wiy)
## UI组件库 wiy-ui
wiy-ui是wiy官方提供的UI组件库，帮助开发者复用现成UI组件来快速开发项目。

开源地址：[https://github.com/wiyit/wiy-ui](https://github.com/wiyit/wiy-ui)
## 命令行界面 wiy-cli
wiy-cli是wiy官方提供的命令行界面，帮助开发者快速开发、构建wiy项目。

开源地址：[https://github.com/wiyit/wiy-cli](https://github.com/wiyit/wiy-cli)
## 脚手架 create-wiy
create-wiy是wiy官方提供的脚手架，帮助开发者快速创建一个wiy项目。

开源地址：[https://github.com/wiyit/create-wiy](https://github.com/wiyit/create-wiy)

