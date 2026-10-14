Pod::Spec.new do |s|
  s.name = 'OwnlevelFinishControls'
  s.version = '1.0.0'
  s.summary = 'OWNLEVEL native optional finish controls'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'OWNLEVEL'
  s.homepage = 'https://github.com/IS03/Ownlevel'
  s.source = { :git => 'https://github.com/IS03/Ownlevel.git' }
  s.platforms = { :ios => '16.4' }
  s.static_framework = true
  s.source_files = '**/*.swift'
  s.dependency 'ExpoModulesCore'
end
