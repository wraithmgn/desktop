'use strict'

const path = require('path')

const projectRoot = path.join(__dirname, '..')
const appPackage = require(path.join(projectRoot, 'app', 'package.json'))

function getDistPath () {
  return path.join(projectRoot, 'dist', `${getProductName()}-${process.platform}-x64`)
}

function getProductName () {
  const productName = appPackage.productName
  return process.env.NODE_ENV === 'development' ? `${productName}-dev` : productName
}

function getName () {
  return appPackage.name
}

function getCompanyName () {
  return appPackage.companyName
}

function getVersion () {
  return appPackage.version
}

function getOSXZipName () {
  const productName = getProductName()
  return `${productName}.zip`
}

function getOSXZipPath () {
  return path.join(getDistPath(), '..', getOSXZipName())
}

function getWindowsInstallerName () {
  const productName = getProductName()
  return `${productName}Setup.msi`
}

function getWindowsInstallerPath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsInstallerName())
}

function getWindowsStandaloneName () {
  const productName = getProductName()
  return `${productName}Setup.exe`
}

function getWindowsStandalonePath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsStandaloneName())
}

function getWindowsFullNugetPackageName () {
  return `${getName()}-${getVersion()}-full.nupkg`
}

function getWindowsFullNugetPackagePath () {
  return path.join(getDistPath(), '..', 'installer', getWindowsFullNugetPackageName())
}

function getBundleID () {
  return appPackage.bundleID
}

module.exports = {
  getDistPath,
  getProductName,
  getCompanyName,
  getVersion,
  getOSXZipName,
  getOSXZipPath,
  getWindowsInstallerName,
  getWindowsInstallerPath,
  getWindowsStandaloneName,
  getWindowsStandalonePath,
  getWindowsFullNugetPackageName,
  getWindowsFullNugetPackagePath,
  getBundleID
}
