import React, { Component } from 'react';
import Sidebar from 'react-sidebar';
import { connect } from 'react-redux';
import AlertContainer from 'react-alert';
import Rodal from 'rodal';
import 'rodal/lib/rodal.css';

import RootMap from './components/RootMap';
import Tools from './components/Tools';
import SearchBox from './components/SearchBox';
import { loadGetCapabilities, reflect, loginAndLoadInstances } from './utils/ajax';
import { getPolyfill } from './utils/utils';
import NotificationPanel from './components/NotificationPanel';
import DummyIcon from './components/DummyIcon';
import Store from './store';

import './App.scss';

class App extends Component {
  alertOptions = {
    offset: 14,
    position: 'bottom left',
    theme: 'dark',
    time: 5000,
    transition: 'scale',
  };

  constructor(props) {
    super(props);
    this.state = {
      isLoaded: false,
      toolsVisible: window.innerWidth > 900,
      newLocation: false,
      isCompare: false,
      user: {},
    };
    getPolyfill();
  }

  componentWillMount() {
    this.fetchLayers();
  }

  componentDidMount() {
    this.updateMapViewFromURL();
  }

  showAlert = () => {
    this.msg.show('Some text or component', {
      time: 2000,
      type: 'success',
      icon: <img src="path/to/some/img/32x32.png" alt="" />,
    });
  };

  fetchLayers() {
    let promises = [];
    Store.current.instances.forEach(instance => {
      promises.push(loadGetCapabilities(instance));
    });
    Promise.all(promises.map(reflect))
      .then(obj => {
        this.handleNewHash();
        const okInstances = obj.filter(x => x.success);
        const insts = Store.current.instances.filter(inst =>
          okInstances.find(inst2 => inst2.name === inst.data),
        );
        this.setState({ isLoaded: true, isModal: false });
        Store.setInstances(insts);
      })
      .catch(e => {
        this.setState({ isLoaded: true, isModal: false });
        App.displayErrorMessage(`An error occured: ${e.message}`);
      });
    Promise.race(promises).then(instName => {
      this.setState({ isLoaded: true, isModal: false });
    });
  }

  static displayErrorMessage(errMsg) {
    const modalDialogId = `error-message-${errMsg}`;
    Store.addModalDialog(
      modalDialogId,
      <Rodal
        animation="slideUp"
        visible={true}
        width={500}
        height={100}
        onClose={() => Store.removeModalDialog(modalDialogId)}
      >
        <NotificationPanel msg={errMsg} type="error" />
      </Rodal>,
    );
  }

  setMapLocation = data => {
    const { lat, lng } = data.location;
    Store.setMapView({ lat, lng, update: true });
  };

  onFinishSearch = res => {
    this._map.refs.wrappedInstance.clearPolygons();
    if (res === undefined || res.length === 0) {
      return;
    }
    this._map.refs.wrappedInstance.showPolygons(res);
    this.setState({ newLocation: false });
  };

  updateMapViewFromURL = () => {
    const { lat, lng, zoom } = this.getUrlParams();
    if (lat || lng) {
      const location = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        zoom: parseInt(zoom, 10),
      };
      Store.setMapView({ ...location, update: true });
    }
  };

  getUrlParams() {
    let path = window.location.hash.replace(/^#\/?|\/$/g, '');
    let params = path.split('&');
    const paramMap = {};
    params.forEach(kv => {
      let [key, value] = kv.split('=');
      return (paramMap[key] = window.decodeURIComponent(value));
    });
    return paramMap;
  }

  handleNewHash = async () => {
    const {
      instanceId,
      datasource,
      preset,
      time,
      evalscript = '',
      evalscripturl = '',
      gain,
      gamma,
      atmFilter,
      layers,
    } = this.getUrlParams();
    const parsedLayers = preset === 'CUSTOM' ? this.parseLayers(layers) : preset;
    const selectedResult = {
      datasource,
      preset,
      time,
      evalscript: window.decodeURIComponent(evalscript),
      evalscripturl,
      gain: gain ? parseFloat(gain) : undefined,
      gamma: gamma ? parseFloat(gamma) : undefined,
      atmFilter,
      layers: parsedLayers,
    };
    const instance = Store.current.instances.find(inst => inst.name === datasource);
    let location = {};
    if (instance) {
      Store.setTabIndex(2);
      Store.setSelectedResult({
        activeLayer: instance,
        ...instance,
        ...selectedResult,
        ...location,
      });
    } else if (instanceId) {
      try {
        const userInstances = await loginAndLoadInstances();
        const selectedInstance = userInstances.find(inst => inst['@id'] === instanceId);
        if (!selectedInstance) {
          App.displayErrorMessage("You don't have access to this instance.");
          return;
        }
        await loadGetCapabilities(selectedInstance);
        Store.setTabIndex(2);
        Store.setDatasources([selectedInstance.name]);
        Store.setSelectedResult({
          activeLayer: selectedInstance,
          ...selectedResult,
          datasource: selectedInstance.name,
          ...location,
        });
      } catch (e) {
        App.displayErrorMessage("You don't have access to this instance.");
      }
    }
  };

  parseLayers(value) {
    if (!value) return null;
    const [r, g, b] = value.split(','),
      layers = { r, g, b };
    return layers;
  }

  onHoverTile = i => {
    this._map.refs.wrappedInstance.highlightTile(i);
  };
  onZoomToPin = item => {
    this._map.refs.wrappedInstance.onZoomToPin(item);
  };
  onZoomTo = () => {
    this._map.refs.wrappedInstance.zoomToActivePolygon();
  };
  onCompareChange = isCompare => {
    this.setState({ isCompare: isCompare });
  };
  onOpacityChange = (opacity, index) => {
    Store.setPinOpacity(index, opacity);
    this._map.refs.wrappedInstance.setOverlayParams(opacity, index);
  };
  pinOrderChange = (oldIndex, newIndex) => {
    this._map.refs.wrappedInstance.changeCompareOrder(oldIndex, newIndex);
  };
  onClearData = () => {
    this._map.refs.wrappedInstance.clearPolygons();
  };

  hideTools = () => {
    this.setState({ toolsVisible: false });
    this.invalidateMapSize(400); // sidebar CSS animation takes 0.3s
  };
  showTools = () => {
    this.setState({ toolsVisible: true });
    this.invalidateMapSize(400); // sidebar CSS animation takes 0.3s
  };
  invalidateMapSize = delayMs => {
    setTimeout(() => {
      this._map.refs.wrappedInstance.invalidateMapSize({ pan: false });
    }, delayMs);
  };

  renderTools() {
    return (
      <div>
        <Tools
          onFinishSearch={this.onFinishSearch}
          onHoverTile={this.onHoverTile}
          onClearData={this.onClearData}
          selectedTile={this.state.selectedTile}
          onCompareChange={this.onCompareChange}
          onOpacityChange={this.onOpacityChange}
          pinOrderChange={this.pinOrderChange}
          onZoomToPin={this.onZoomToPin}
          onCollapse={this.hideTools}
        />
      </div>
    );
  }

  render() {
    const sideBarWidth = Math.max(300, Math.min(440, window.innerWidth - 40));
    const mapWidth = this.state.toolsVisible ? window.innerWidth - sideBarWidth : window.innerWidth;
    if (!this.state.isLoaded) {
      return (
        <div id="loading">
          <i className="fa fa-cog fa-spin fa-3x fa-fw" />Loading ...{' '}
        </div>
      );
    }

    return (
      <div className="eocloudRoot">
        <Sidebar
          sidebar={this.renderTools()}
          docked={this.state.toolsVisible}
          styles={{
            sidebar: {
              // sidebar width should be:
              // - at least 300 (if window is too narrow, user must scroll horizontally)
              // - at most 440 (if window is very wide, we don't need that much space)
              // - equal to window width otherwise (fill the whole window and make the best of it)
              width: sideBarWidth,
              backgroundColor: '#3b3d4d',
            },
            root: {
              overflow: 'auto',
            },
            content: {
              overflow: 'initial',
            },
          }}
        >
          <AlertContainer ref={a => (this.msg = a)} {...this.alertOptions} />

          <RootMap
            ref={e => {
              this._map = e;
            }}
            location={this.state.location}
            mapId="mapId"
            width={mapWidth}
          />

          <div id="Controls">
            <div id="ControlsContent">
              <div className="pull-right">
                <DummyIcon />
                <div className="clear-both-700" />
                <SearchBox
                  onLocationPicked={this.setMapLocation}
                  toolsVisible={this.state.toolsVisible}
                  hideTools={this.hideTools}
                />
              </div>
            </div>
          </div>

          {!this.state.toolsVisible && (
            <a className="toggleSettings" onClick={this.showTools}>
              <i className="fa fa-bars" />
            </a>
          )}

          {this.props.modalDialogs.map(tc => (
            <div key={tc.id} className="modalDialog">
              {tc.component}
            </div>
          ))}
        </Sidebar>
      </div>
    );
  }
}

export default connect(store => store)(App);
