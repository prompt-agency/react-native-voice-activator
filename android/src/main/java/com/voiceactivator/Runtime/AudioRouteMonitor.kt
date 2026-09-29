package com.voiceactivator.Runtime

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager

internal class AudioRouteMonitor(
  context: Context? = null,
) {
  private val applicationContext = context?.applicationContext
  private val audioManager =
    applicationContext?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private var monitoring = false
  private var currentRoute: String? = null
  private var routeChangedHandler: ((route: String, previousRoute: String?) -> Unit)? = null
  private var audioDeviceCallback: AudioDeviceCallback? = null

  fun startMonitoring(handler: ((route: String, previousRoute: String?) -> Unit)? = null) {
    routeChangedHandler = handler
    if (monitoring) {
      emitCurrentRoute()
      return
    }

    monitoring = true
    currentRoute = detectCurrentRoute()
    registerPlatformCallback()
  }

  fun stopMonitoring() {
    if (!monitoring) {
      routeChangedHandler = null
      return
    }

    monitoring = false
    routeChangedHandler = null
    unregisterPlatformCallback()
  }

  fun isMonitoring(): Boolean = monitoring

  fun updateRoute(route: String) {
    if (!monitoring) {
      return
    }

    val previousRoute = currentRoute
    if (previousRoute == route) {
      return
    }

    currentRoute = route
    routeChangedHandler?.invoke(route, previousRoute)
  }

  private fun emitCurrentRoute() {
    if (!monitoring) {
      return
    }

    updateRoute(detectCurrentRoute())
  }

  private fun detectCurrentRoute(): String {
    val manager = audioManager ?: return currentRoute ?: "default"

    val devices = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
    val prioritizedDevice =
      devices.firstOrNull { it.type in bluetoothDeviceTypes } ?:
        devices.firstOrNull { it.type in wiredDeviceTypes } ?:
        devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER } ?:
        devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE } ?:
        devices.firstOrNull()

    return prioritizedDevice?.let(::mapRoute) ?: (currentRoute ?: "default")
  }

  private fun registerPlatformCallback() {
    val manager = audioManager ?: return

    if (audioDeviceCallback != null) {
      return
    }

    val callback =
      object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
          emitCurrentRoute()
        }

        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
          emitCurrentRoute()
        }
      }

    manager.registerAudioDeviceCallback(callback, null)
    audioDeviceCallback = callback
  }

  private fun unregisterPlatformCallback() {
    val manager = audioManager ?: return

    val callback = audioDeviceCallback ?: return
    manager.unregisterAudioDeviceCallback(callback)
    audioDeviceCallback = null
  }

  private fun mapRoute(device: AudioDeviceInfo): String =
    when (device.type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_BROADCAST,
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLE_SPEAKER -> "bluetooth"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE -> "wired"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
      else -> "default"
    }

  private companion object {
    val bluetoothDeviceTypes =
      setOf(
        AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_BROADCAST,
        AudioDeviceInfo.TYPE_BLE_HEADSET,
        AudioDeviceInfo.TYPE_BLE_SPEAKER,
      )

    val wiredDeviceTypes =
      setOf(
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_USB_HEADSET,
        AudioDeviceInfo.TYPE_USB_DEVICE,
      )
  }
}
